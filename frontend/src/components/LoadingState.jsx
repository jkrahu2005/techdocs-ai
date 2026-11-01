import { Sparkles } from "lucide-react";

export default function LoadingState() {
  return (
    <div className="mt-7 rounded-2xl border border-base-200 bg-base-100 p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="loading loading-spinner loading-md text-primary" />

        <div>
          <p className="text-sm font-semibold">
            Thinking through your question...
          </p>

          <p className="mt-1 text-xs text-base-content/50">
            Retrieving documentation and generating an answer
          </p>
        </div>

        <Sparkles className="ml-auto text-primary/50" size={20} />
      </div>

      <div className="mt-7 space-y-3">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-11/12" />
        <div className="skeleton h-3 w-4/5" />
      </div>
    </div>
  );
}