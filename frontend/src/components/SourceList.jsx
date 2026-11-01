import { ExternalLink, FileText } from "lucide-react";

function getSafeUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }

    return null;
  } catch {
    return null;
  }
}

export default function SourceList({ sources = [] }) {
  if (!sources.length) return null;

  return (
    <section className="mt-6 border-t border-base-200 pt-5">
      <h3 className="mb-3 text-sm font-semibold">
        Sources ({sources.length})
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source, index) => {
          const safeUrl = getSafeUrl(source.url);

          return (
            <a
              key={source.id || index}
              href={safeUrl || undefined}
              target={safeUrl ? "_blank" : undefined}
              rel={safeUrl ? "noopener noreferrer" : undefined}
              className={`group rounded-xl border border-base-200 bg-base-50 p-3 transition ${
                safeUrl
                  ? "hover:border-primary/40 hover:bg-primary/5"
                  : "cursor-default"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FileText size={17} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {source.title || "Documentation source"}
                    </p>

                    {safeUrl && (
                      <ExternalLink
                        size={14}
                        className="shrink-0 text-base-content/40 group-hover:text-primary"
                      />
                    )}
                  </div>

                  <p className="mt-1 text-xs text-base-content/55">
                    {source.section || "PostgreSQL documentation"}
                  </p>

                  {source.pageStart && (
                    <p className="mt-1 text-xs text-base-content/40">
                      Page {source.pageStart}
                      {source.pageEnd &&
                      source.pageEnd !== source.pageStart
                        ? `–${source.pageEnd}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}