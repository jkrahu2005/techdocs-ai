import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";
import SourceList from "./SourceList";

const markdownComponents = {
  p: ({ children }) => (
    <p className="mb-4 leading-7 last:mb-0">
      {children}
    </p>
  ),

  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-xl font-bold">
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2 className="mb-3 mt-6 text-lg font-bold">
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 font-semibold">
      {children}
    </h3>
  ),

  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-2 pl-6">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-2 pl-6">
      {children}
    </ol>
  ),

  li: ({ children }) => (
    <li className="pl-1 leading-7">{children}</li>
  ),

  strong: ({ children }) => (
    <strong className="font-semibold text-base-content">
      {children}
    </strong>
  ),

  code: ({ className, children }) => (
    className ? (
      <code className="block font-mono text-sm leading-6">
        {children}
      </code>
    ) : (
      <code className="rounded-md bg-base-200 px-1.5 py-0.5 font-mono text-sm text-primary">
        {children}
      </code>
    )
  ),

  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-slate-100">
      {children}
    </pre>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-primary/40 pl-4 text-base-content/70">
      {children}
    </blockquote>
  ),

  a: ({ href, children }) => {
    let safeUrl = null;

    try {
      const parsed = new URL(href);
      if (["http:", "https:"].includes(parsed.protocol)) {
        safeUrl = parsed.href;
      }
    } catch {
      // Render unsafe or invalid URLs as plain text.
    }

    return safeUrl ? (
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-primary"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
};

export default function AnswerCard({
  question,
  answer,
  status,
  sources,
}) {
  const answered = status === "answered";

  return (
    <section className="mt-7 space-y-4">
      {/* Original question */}
      <div className="rounded-xl border border-base-200 bg-base-100 p-4 sm:p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-base-content/45">
          Your question
        </p>

        <p className="text-sm font-medium leading-7 sm:text-base">
          {question}
        </p>
      </div>

      {/* Generated answer */}
      <div className="rounded-2xl border border-base-200 bg-base-100 p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Sparkles size={18} />
            </div>

            <h2 className="font-semibold">
              Answer
            </h2>
          </div>

          <span
            className={`badge ${
              answered ? "badge-success badge-outline" : "badge-warning badge-outline"
            }`}
          >
            {answered ? "Answered" : "Insufficient context"}
          </span>
        </div>

        <div className="text-sm text-base-content/85 sm:text-base">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {answer || "No answer was returned."}
          </ReactMarkdown>
        </div>

        <SourceList sources={sources} />
      </div>
    </section>
  );
}