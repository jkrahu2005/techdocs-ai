import { useState } from "react";

import Navbar from "./components/Navbar";
import QuestionInput from "./components/QuestionInput";
import SuggestedQuestions from "./components/SuggestedQuestions";
import AnswerCard from "./components/AnswerCard";
import LoadingState from "./components/LoadingState";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const MAX_MEMORY_TURNS = 6;

export default function App() {
  const [question, setQuestion] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const submittedQuestion = question.trim();

    if (!submittedQuestion || loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: submittedQuestion,
          conversationHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          data.message ||
          `Request failed with status ${response.status}`
        );
      }

      setResult({
        question: submittedQuestion,
        status: data.status,
        answer: data.answer,
        sources: data.sources || [],
      });

      // Save only successfully answered turns.
      // Keep the latest six turns in React state.
      if (data.status === "answered") {
        setConversationHistory((previousHistory) => {
          return [
            ...previousHistory,
            {
              question: submittedQuestion,
              answer: data.answer,
            },
          ].slice(-MAX_MEMORY_TURNS);
        });
      }

      setQuestion("");
    } catch (err) {
      console.error("TechDocs AI API error:", err);

      setError(
        err.message ||
        "Unable to connect to TechDocs AI. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    setConversationHistory([]);
    setResult(null);
    setQuestion("");
    setError("");
  }

  return (
    <div data-theme="light" className="min-h-screen bg-base-200/50">
      <Navbar
        onNewChat={handleNewChat}
        hasConversation={conversationHistory.length > 0 || !!result}
      />

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">

        {/* Welcome section */}
        {!result && !loading && (
          <section className="mb-9 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/65">
              <span className="h-2 w-2 rounded-full bg-success" />
              PostgreSQL 19 documentation assistant
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Understand PostgreSQL,
              <span className="block text-primary">
                without the complexity.
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-base-content/60 sm:text-base">
              Ask technical questions and get grounded answers
              from PostgreSQL documentation, with relevant
              source references.
            </p>
          </section>
        )}

        {/* Question input */}
        <QuestionInput
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          loading={loading}
          conversationTurns={conversationHistory.length}
        />

        {/* Error message */}
        {error && (
          <div role="alert" className="alert alert-error mt-5 text-sm">
            <span>{error}</span>
          </div>
        )}

        {/* Loading state */}
        {loading && <LoadingState />}

        {/* Generated answer */}
        {result && !loading && (
          <AnswerCard
            question={result.question}
            answer={result.answer}
            status={result.status}
            sources={result.sources}
          />
        )}

        {/* Initial suggestions */}
        {!result && !loading && (
          <SuggestedQuestions onSelect={setQuestion} />
        )}

        {/* Footer */}
        <footer className="mt-14 border-t border-base-300 pt-5 text-center">
          <p className="text-xs text-base-content/45">
            Powered by hybrid retrieval and Gemini ·
            Grounded in PostgreSQL 19 documentation
          </p>
        </footer>
      </main>
    </div>
  );
}