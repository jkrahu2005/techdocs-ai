import { Database, RotateCcw } from "lucide-react";

export default function Navbar({ onNewChat, hasConversation }) {
  return (
    <header className="sticky top-0 z-20 border-b border-base-200 bg-base-100/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-content">
            <Database size={21} />
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-tight">
              TechDocs AI
            </h1>
            <p className="text-xs text-base-content/60">
              Documentation assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="badge badge-success badge-outline hidden sm:flex">
            PostgreSQL 19
          </div>

          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={onNewChat}
            disabled={!hasConversation}
          >
            <RotateCcw size={15} />
            New chat
          </button>
        </div>
      </div>
    </header>
  );
}