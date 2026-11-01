import { MessageSquareText } from "lucide-react";

const suggestions = [
  "What is Write-Ahead Logging (WAL) in PostgreSQL?",
  "What is shared_buffers?",
  "Why is autovacuum necessary?",
];

export default function SuggestedQuestions({ onSelect }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquareText
          size={16}
          className="text-base-content/50"
        />

        <h3 className="text-sm font-semibold">
          Try asking
        </h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="btn btn-outline btn-sm h-auto min-h-9 whitespace-normal border-base-300 bg-base-100 px-3 py-2 text-left text-xs font-normal hover:border-primary hover:bg-primary/5"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}