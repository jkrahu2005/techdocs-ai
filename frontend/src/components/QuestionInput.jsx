import { ArrowUp, CornerDownLeft } from "lucide-react";

export default function QuestionInput({
  question,
  setQuestion,
  onSubmit,
  loading,
  conversationTurns,
}) {
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!loading && question.trim()) {
        onSubmit(event);
      }
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5"
    >
      <label
        htmlFor="question"
        className="mb-3 block text-sm font-semibold"
      >
        What would you like to know?
      </label>

      <textarea
        id="question"
        className="textarea textarea-bordered min-h-28 w-full resize-y bg-base-100 text-sm leading-6 focus:outline-none focus:border-primary"
        placeholder="Ask anything about PostgreSQL..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={1000}
        disabled={loading}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-base-content/50">
          <p>PostgreSQL 19 documentation</p>

          {conversationTurns > 0 && (
            <p className="mt-1 text-primary">
              {conversationTurns} conversation turn(s) in context
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-base-content/40 sm:inline">
            <CornerDownLeft size={12} className="mr-1 inline" />
            Enter to send
          </span>

          <button
            type="submit"
            className="btn btn-primary btn-sm gap-2 px-4"
            disabled={loading || !question.trim()}
          >
            {loading ? "Thinking..." : "Ask question"}
            {!loading && <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </form>
  );
}