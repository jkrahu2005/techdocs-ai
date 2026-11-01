
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config({ path: "../.env" });

const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";
const TOP_K = 5;

// Initial test cases based on documentation pages
// already observed in your retrieval results.
const TEST_CASES = [
  {
    question: "What is the PostgreSQL client/server architecture?",
    expectedPages: [{ start: 42, end: 43 }],
  },
  {
    question:
      "How do PostgreSQL clients communicate with the server, and how are concurrent connections handled?",
    expectedPages: [{ start: 42, end: 43 }],
  },
  {
    question: "How do I create a table in PostgreSQL?",
    expectedPages: [{ start: 46, end: 47 }],
  },
  {
    question:
      "How can I commit or roll back a PostgreSQL transaction?",
    expectedPages: [{ start: 57, end: 58 }],
  },
  {
    question:
      "What is a schema in PostgreSQL, and what objects can it contain?",
    expectedPages: [{ start: 128, end: 129 }],
  },
  {
    question: "What is the current stock price of Nvidia?",
    expectedPages: null, // Out of scope; excluded from retrieval metrics.
  },
];

function getHits(response) {
  return (
    response?.result?.hits ??
    response?.matches ??
    response?.result?.matches ??
    []
  );
}

function getPageNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesExpectedPages(hit, expectedPages) {
  const fields =
    hit.fields ?? hit.record ?? hit.metadata ?? hit;

  const start = getPageNumber(
    fields.pageStart ?? fields.page_start
  );

  const end = getPageNumber(
    fields.pageEnd ?? fields.page_end
  );

  if (start === null || end === null) {
    return false;
  }

  return expectedPages.some(
    (range) => start <= range.end && end >= range.start
  );
}

function getHitDetails(hit, rank) {
  const fields =
    hit.fields ?? hit.record ?? hit.metadata ?? hit;

  return {
    rank,
    id: hit._id ?? hit.id ?? "unknown",
    score: hit._score ?? hit.score ?? null,
    pageStart: fields.pageStart ?? fields.page_start ?? "?",
    pageEnd: fields.pageEnd ?? fields.page_end ?? "?",
  };
}

async function main() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error(
      "PINECONE_API_KEY is missing from backend/.env"
    );
  }

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pc.index({
    name: INDEX_NAME,
    namespace: NAMESPACE,
  });

  let evaluatedQueries = 0;
  let successfulQueries = 0;
  let reciprocalRankSum = 0;

  console.log("Pinecone Retrieval Evaluation");
  console.log(`Index: ${INDEX_NAME}`);
  console.log(`Namespace: ${NAMESPACE}`);
  console.log(`Top K: ${TOP_K}`);

  for (const testCase of TEST_CASES) {
    console.log("\n" + "=".repeat(70));
    console.log(`Question: ${testCase.question}`);

    const response = await index.searchRecords({
      query: {
        topK: TOP_K,
        inputs: {
          text: testCase.question,
        },
      },
    });

    const hits = getHits(response);

    console.log(`Retrieved: ${hits.length} chunks`);

    const details = hits.map((hit, index) =>
      getHitDetails(hit, index + 1)
    );

    for (const result of details) {
      const score =
        result.score === null
          ? "N/A"
          : Number(result.score).toFixed(4);

      console.log(
        `#${result.rank} | score=${score} | ` +
        `pages ${result.pageStart}-${result.pageEnd} | ` +
        `ID=${result.id}`
      );
    }

    // Out-of-scope queries are useful for answer-generation
    // testing, but cannot be judged by expected-page overlap.
    if (!testCase.expectedPages) {
      console.log("Retrieval metric: Not scored (out of scope)");
      continue;
    }

    evaluatedQueries++;

    const firstRelevantIndex = hits.findIndex((hit) =>
      matchesExpectedPages(hit, testCase.expectedPages)
    );

    if (firstRelevantIndex !== -1) {
      successfulQueries++;

      const reciprocalRank = 1 / (firstRelevantIndex + 1);
      reciprocalRankSum += reciprocalRank;

      console.log(
        `Expected-page match: PASS (rank ${firstRelevantIndex + 1})`
      );
    } else {
      console.log("Expected-page match: FAIL");
    }
  }

  const hitRateAtK =
    evaluatedQueries > 0
      ? successfulQueries / evaluatedQueries
      : 0;

  const mrrAtK =
    evaluatedQueries > 0
      ? reciprocalRankSum / evaluatedQueries
      : 0;

  console.log("\n" + "=".repeat(70));
  console.log("BASELINE METRICS");
  console.log(`Evaluated queries: ${evaluatedQueries}`);
  console.log(`Queries with a page match: ${successfulQueries}`);
  console.log(`Hit@${TOP_K}: ${(hitRateAtK * 100).toFixed(1)}%`);
  console.log(`MRR@${TOP_K}: ${mrrAtK.toFixed(3)}`);
  console.log(
    "\nNote: These are preliminary page-overlap metrics, " +
    "not final measures of semantic relevance."
  );
}

main().catch((error) => {
  console.error("Evaluation failed:", error.message);
  process.exitCode = 1;
});
