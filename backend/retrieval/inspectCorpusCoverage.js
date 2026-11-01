
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";

dotenv.config({ path: "../.env" });

const EXCERPT_LENGTH = 900;
const TOP_RESULTS = 5;

const QUESTIONS = [
  "How do I configure streaming replication using pg_basebackup?",
  "How do I configure pg_hba.conf to require SCRAM-SHA-256 authentication?",
  "How do I enable WAL archiving and point-in-time recovery?",
  "How should I tune autovacuum for a large write-heavy table?",
  "How do logical replication publications and subscriptions work?",
  "How do I diagnose slow queries using EXPLAIN ANALYZE?",
  "How should I tune shared_buffers and work_mem for a production PostgreSQL server?",
];

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .match(/[a-z0-9_]+/g) ?? [];
}

function buildIndex(chunks) {
  const documents = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const frequencies = new Map();

    for (const token of tokens) {
      frequencies.set(
        token,
        (frequencies.get(token) ?? 0) + 1
      );
    }

    return {
      chunk,
      length: tokens.length,
      frequencies,
    };
  });

  const documentFrequency = new Map();

  for (const document of documents) {
    for (const token of document.frequencies.keys()) {
      documentFrequency.set(
        token,
        (documentFrequency.get(token) ?? 0) + 1
      );
    }
  }

  const averageLength =
    documents.reduce(
      (sum, document) => sum + document.length,
      0
    ) / Math.max(documents.length, 1);

  return {
    documents,
    documentFrequency,
    averageLength,
    totalDocuments: documents.length,
  };
}

function searchCorpus(index, question) {
  const queryTokens = [...new Set(tokenize(question))];

  const {
    documents,
    documentFrequency,
    averageLength,
    totalDocuments,
  } = index;

  const K1 = 1.5;
  const B = 0.75;

  return documents
    .map((document) => {
      let score = 0;
      let matchedTerms = 0;

      for (const token of queryTokens) {
        const tf =
          document.frequencies.get(token) ?? 0;

        if (tf === 0) continue;

        matchedTerms++;

        const df =
          documentFrequency.get(token) ?? 0;

        const idf = Math.log(
          1 +
            (totalDocuments - df + 0.5) /
              (df + 0.5)
        );

        const normalization =
          K1 *
          (1 -
            B +
            B * document.length /
              (averageLength || 1));

        score +=
          idf *
          (tf * (K1 + 1)) /
          (tf + normalization);
      }

      return {
        chunk: document.chunk,
        score,
        matchedTerms,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_RESULTS);
}

async function main() {
  const raw = await readFile(
    new URL(
      "../chunking/output/baseline-200-pages.json",
      import.meta.url
    ),
    "utf8"
  );

  const parsed = JSON.parse(raw);
  const chunks = Array.isArray(parsed)
    ? parsed
    : parsed.chunks;

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Baseline corpus is empty or invalid.");
  }

  const index = buildIndex(chunks);

  console.log("Local corpus coverage inspection");
  console.log(`Corpus chunks: ${chunks.length}`);
  console.log("Method: BM25 keyword retrieval");
  console.log(
    "Note: keyword matches help locate evidence; they do not prove answerability."
  );

  for (const question of QUESTIONS) {
    console.log("\n" + "=".repeat(75));
    console.log(`Question: ${question}`);

    const results = searchCorpus(index, question);

    if (results.length === 0) {
      console.log("No keyword matches found.");
      continue;
    }

    for (const [position, result] of results.entries()) {
      const chunk = result.chunk;

      console.log(
        `\n#${position + 1} | BM25=${result.score.toFixed(4)} | ` +
        `matched terms=${result.matchedTerms} | ` +
        `pages ${chunk.pageStart ?? "?"}-${chunk.pageEnd ?? "?"} | ` +
        `ID=${chunk.id}`
      );

      console.log(
        String(chunk.text ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, EXCERPT_LENGTH)
      );
    }
  }
}

main().catch((error) => {
  console.error("Coverage inspection failed:", error.message);
  process.exitCode = 1;
});
