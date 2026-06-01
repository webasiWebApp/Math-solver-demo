import { NextResponse } from "next/server";

type GeminiPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type SolverPayload = {
  finalAnswer?: string;
  steps?: string[];
  practiceQuestion?: string;
};

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const systemPrompt = `You are a careful math tutor for Grades 4 to 6 pupils.
Use simple language.
Show all steps.
Never skip calculations.
After the answer, give one similar practice question.
Return only valid JSON with this exact shape:
{
  "finalAnswer": "short final answer with units if needed",
  "steps": ["one clear step per item, include every calculation using ="],
  "practiceQuestion": "one similar practice question"
}
Rules:
- If text in an image is unclear, say what you can read and solve only from clear information.
- Every arithmetic calculation must be written as a full equation, for example "120 / 3 = 40".
- Do not use markdown.`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const question = String(formData.get("question") || "").trim();
  const image = formData.get("image");

  if (!question && !(image instanceof File && image.size > 0)) {
    return NextResponse.json(
      { error: "Please provide a question as text or upload an image." },
      { status: 400 }
    );
  }

  const parts: GeminiPart[] = [
    {
      text: `${systemPrompt}

Question:
${question || "The question is in the uploaded image."}`
    }
  ];

  if (image instanceof File && image.size > 0) {
    if (!allowedImageTypes.has(image.type)) {
      return NextResponse.json(
        { error: "Please upload a PNG, JPG, or WebP image." },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    parts.push({
      inlineData: {
        mimeType: image.type,
        data: imageBuffer.toString("base64")
      }
    });
  }

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const geminiData = (await geminiResponse.json()) as GeminiResponse;

  if (!geminiResponse.ok) {
    return NextResponse.json(
      {
        error:
          geminiData.error?.message ||
          "Gemini could not solve the question. Check your API key and model name."
      },
      { status: 502 }
    );
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseGeminiJson(rawText);

  if (!parsed.steps?.length || !parsed.finalAnswer || !parsed.practiceQuestion) {
    return NextResponse.json(
      { error: "Gemini returned an incomplete answer. Please try again with a clearer question." },
      { status: 502 }
    );
  }

  const validation = validateCalculations(parsed.steps);

  if (validation.status === "failed") {
    return NextResponse.json(
      {
        error:
          "The generated solution had a calculation mistake, so it was not shown. Please try again.",
        validation
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    finalAnswer: parsed.finalAnswer,
    steps: parsed.steps,
    practiceQuestion: parsed.practiceQuestion,
    validation
  });
}

function parseGeminiJson(text: string): SolverPayload {
  try {
    return JSON.parse(text) as SolverPayload;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {};
    }
    try {
      return JSON.parse(jsonMatch[0]) as SolverPayload;
    } catch {
      return {};
    }
  }
}

function validateCalculations(steps: string[]) {
  const checkedCalculations: string[] = [];
  const issues: string[] = [];

  for (const step of steps) {
    const equations = extractEquations(step);

    for (const equation of equations) {
      const check = checkEquation(equation);
      if (!check) {
        continue;
      }

      checkedCalculations.push(equation);
      if (!check.correct) {
        issues.push(`${equation} should be ${formatNumber(check.leftValue)} = ${formatNumber(check.rightValue)}.`);
      }
    }
  }

  if (issues.length > 0) {
    return {
      status: "failed" as const,
      message: "The answer was blocked because at least one calculation was wrong.",
      checkedCalculations,
      issues
    };
  }

  if (checkedCalculations.length === 0) {
    return {
      status: "needs_review" as const,
      message: "No checkable equations were found. Please review the answer carefully.",
      checkedCalculations,
      issues: ["The solution should include calculations written with equals signs."]
    };
  }

  return {
    status: "passed" as const,
    message: `Calculation check passed for ${checkedCalculations.length} equation${
      checkedCalculations.length === 1 ? "" : "s"
    }.`,
    checkedCalculations,
    issues
  };
}

function extractEquations(text: string) {
  const matches = text.match(/[0-9][0-9.,\s+\-*/xX×÷()]*=\s*-?[0-9][0-9.,\s+\-*/xX×÷()]*/g);
  return matches?.map((match) => match.trim()) || [];
}

function checkEquation(equation: string) {
  const sides = equation.split("=");
  if (sides.length !== 2) {
    return null;
  }

  const leftValue = evaluateArithmetic(sides[0]);
  const rightValue = evaluateArithmetic(sides[1]);

  if (leftValue === null || rightValue === null) {
    return null;
  }

  return {
    leftValue,
    rightValue,
    correct: Math.abs(leftValue - rightValue) < 0.000001
  };
}

function evaluateArithmetic(input: string) {
  const normalized = input
    .replace(/,/g, "")
    .replace(/[xX×]/g, "*")
    .replace(/÷/g, "/")
    .trim();

  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    return null;
  }

  try {
    const value = Function(`"use strict"; return (${normalized});`)() as unknown;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
