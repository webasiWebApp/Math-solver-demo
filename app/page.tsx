"use client";

import { FormEvent, useState } from "react";

type SolverResponse = {
  finalAnswer: string;
  steps: string[];
  practiceQuestion: string;
  validation: {
    status: "passed" | "needs_review" | "failed";
    message: string;
    checkedCalculations: string[];
    issues: string[];
  };
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<SolverResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!question.trim() && !image) {
      setError("Please type a math question or upload a related image.");
      return;
    }

    const formData = new FormData();
    formData.append("question", question);
    if (image) {
      formData.append("image", image);
    }

    setLoading(true);
    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The solver could not answer this question.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const validationClass =
    result?.validation.status === "passed"
      ? "ok"
      : result?.validation.status === "failed"
        ? "fail"
        : "warn";

  return (
    <main className="page">
      <div className="shell">
        <header className="header">
          <h1>Math Solver for Grades 4 to 6</h1>
          <p>
            Type a question, or add a picture of the question. The app asks Gemini for a simple
            explanation, then checks the arithmetic steps before showing the answer.
          </p>
        </header>

        <section className="workspace">
          <form className="panel form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="question">Math question</label>
              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Example: Ishtiac is 120 cm tall. Ishtiac is 3 times as tall as Kunal. How tall is Kunal?"
              />
              <p className="hint">
                Use clear text when you can. If the image has the question, you can leave this blank.
              </p>
            </div>

            <div className="field">
              <label htmlFor="image">Related image</label>
              <input
                id="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              />
              <p className="hint">Supported image types: PNG, JPG, and WebP.</p>
            </div>

            <div className="actions">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Solving..." : "Solve question"}
              </button>
              {loading ? <span className="status">Checking every calculation step.</span> : null}
            </div>
          </form>

          <section className="panel result" aria-live="polite">
            {error ? <div className="error">{error}</div> : null}

            {!result && !error ? (
              <div className="empty">
                Your answer will appear here with simple steps, full calculations, and one similar
                practice question.
              </div>
            ) : null}

            {result ? (
              <article className="answer">
                <div className={`validation ${validationClass}`}>{result.validation.message}</div>

                <section className="answer-section">
                  <h2>Final Answer</h2>
                  <p>{result.finalAnswer}</p>
                </section>

                <section className="answer-section">
                  <h3>Steps</h3>
                  <ol className="steps">
                    {result.steps.map((step, index) => (
                      <li key={`${step}-${index}`}>{step}</li>
                    ))}
                  </ol>
                </section>

                <section className="answer-section practice">
                  <h3>Practice Question</h3>
                  <p>{result.practiceQuestion}</p>
                </section>

                {result.validation.issues.length > 0 ? (
                  <section className="answer-section">
                    <h3>Calculation Review</h3>
                    <ul>
                      {result.validation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </article>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
