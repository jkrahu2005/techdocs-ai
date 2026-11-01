import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config({ path: "../.env" });

// --------------------------------------------------
// 1. Configuration
// --------------------------------------------------

const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";

const TOP_K = 5;
const CANDIDATE_K = 30;
const RRF_K = 60;
const EXCERPT_LENGTH = 600;

const CANDIDATE_THRESHOLDS = [
  0.42,
  0.44,
  0.45,
  0.46,
  0.48,
];

// scopeType:
//   "in-scope"   = known answerable test question
//   "unrelated"  = clearly outside the document's domain
//   "borderline" = PostgreSQL-specific; requires manual scope review

// --------------------------------------------------
// 2. Evaluation questions
// --------------------------------------------------

const TEST_CASES = [
  // Known in-scope questions
  {
    question: "What is the PostgreSQL client/server architecture?",
    expectedPages: [{ start: 42, end: 43 }],
    scopeType: "in-scope",
  },
  {
    question: "What responsibilities does the postgres server process have?",
    expectedPages: [{ start: 42, end: 42 }],
    scopeType: "in-scope",
  },
  {
    question: "How do remote PostgreSQL clients communicate with the server?",
    expectedPages: [{ start: 42, end: 43 }],
    scopeType: "in-scope",
  },
  {
    question: "How does PostgreSQL handle concurrent client connections?",
    expectedPages: [{ start: 42, end: 43 }],
    scopeType: "in-scope",
  },
  {
    question: "How can I create a database from the command line?",
    expectedPages: [{ start: 42, end: 43 }],
    scopeType: "in-scope",
  },
  {
    question: "How do I create a table in PostgreSQL?",
    expectedPages: [{ start: 46, end: 47 }],
    scopeType: "in-scope",
  },
  {
    question: "Does SQL guarantee the order of rows in a table?",
    expectedPages: [{ start: 46, end: 47 }],
    scopeType: "in-scope",
  },
  {
    question: "What is a database cluster in PostgreSQL?",
    expectedPages: [{ start: 46, end: 47 }],
    scopeType: "in-scope",
  },
  {
    question: "How can I commit or roll back a transaction?",
    expectedPages: [{ start: 57, end: 58 }],
    scopeType: "in-scope",
  },
  {
    question: "How do I cancel changes made within a transaction?",
    expectedPages: [{ start: 57, end: 58 }],
    scopeType: "in-scope",
  },
  {
    question:
      "What happens when SQL statements run without an explicit BEGIN?",
    expectedPages: [{ start: 57, end: 58 }],
    scopeType: "in-scope",
  },
  {
    question:
      "What is a schema in PostgreSQL, and what objects can it contain?",
    expectedPages: [{ start: 128, end: 129 }],
    scopeType: "in-scope",
  },
  {
    question: "How are schemas organized inside PostgreSQL databases?",
    expectedPages: [{ start: 128, end: 129 }],
    scopeType: "in-scope",
  },

  // Clearly unrelated negative examples
  {
    question: "What is the current stock price of Nvidia?",
    expectedPages: null,
    scopeType: "unrelated",
  },
  {
    question: "What will the weather be in Rourkela tomorrow?",
    expectedPages: null,
    scopeType: "unrelated",
  },
  {
    question: "How do I implement React useEffect hooks?",
    expectedPages: null,
    scopeType: "unrelated",
  },
  {
    question: "Who won the latest IPL season?",
    expectedPages: null,
    scopeType: "unrelated",
  },

  // Borderline PostgreSQL-specific questions
  {
    question:
      "How do I configure streaming replication using pg_basebackup?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How do I configure pg_hba.conf to require SCRAM-SHA-256 authentication?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How do I enable WAL archiving and point-in-time recovery?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How should I tune autovacuum for a large write-heavy table?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How do logical replication publications and subscriptions work?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How do I diagnose slow queries using EXPLAIN ANALYZE?",
    expectedPages: null,
    scopeType: "borderline",
  },
  {
    question:
      "How should I tune shared_buffers and work_mem for a production PostgreSQL server?",
    expectedPages: null,
    scopeType: "borderline",
  },
];

// --------------------------------------------------
// 3. Pinecone response helpers
// --------------------------------------------------

function getHits(response) {
  return (
    response?.result?.hits ??
    response?.matches ??
    response?.result?.matches ??
    []
  );
}

function tokenize(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .match(/[a-z0-9_]+/g) ?? []
  );
}

function getPageNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getSourceUrl(chunk) {
  return (
    chunk.sourceUrl ??
    (String(chunk.source ?? "").startsWith("http")
      ? chunk.source
      : null)
  );
}

function describeChunkSource(chunk) {
  const title =
    chunk.sourceTitle ??
    chunk.source ??
    "Unknown source";

  const details = [];

  if (chunk.section) {
    details.push(`section ${chunk.section}`);
  }

  if (chunk.pageStart != null) {
    details.push(
      `PDF pages ${chunk.pageStart}-${chunk.pageEnd ?? chunk.pageStart}`
    );
  }

  return (
    `${title}` +
    (details.length ? ` | ${details.join(" | ")}` : "")
  );
}

// --------------------------------------------------
// 4. BM25 keyword retrieval
// --------------------------------------------------

function buildBm25Index(chunks) {
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

function searchBm25(index, question, limit) {
  const queryTokens = [...new Set(tokenize(question))];

  const {
    documents,
    documentFrequency,
    averageLength,
    totalDocuments,
  } = index;

  const K1 = 1.5;
  const B = 0.75;
  const results = [];

  for (const document of documents) {
    let score = 0;

    for (const token of queryTokens) {
      const tf = document.frequencies.get(token) ?? 0;

      if (tf === 0) continue;

      const df = documentFrequency.get(token) ?? 0;

      const idf = Math.log(
        1 +
          (totalDocuments - df + 0.5) /
            (df + 0.5)
      );

      const normalization =
        K1 *
        (
          1 -
          B +
          B * document.length / (averageLength || 1)
        );

      score +=
        idf *
        (tf * (K1 + 1)) /
        (tf + normalization);
    }

    if (score > 0) {
      results.push({
        id: document.chunk.id,
        chunk: document.chunk,
        bm25Score: score,
      });
    }
  }

  return results
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, limit);
}

// --------------------------------------------------
// 5. Reciprocal Rank Fusion
// --------------------------------------------------

function fuseWithRrf(semanticResults, keywordResults) {
  const fused = new Map();

  function addResults(results, type) {
    results.forEach((result, index) => {
      if (!result.id) return;

      if (!fused.has(result.id)) {
        fused.set(result.id, {
          id: result.id,
          chunk: result.chunk,
          rrfScore: 0,
          semanticScore: null,
          bm25Score: null,
        });
      }

      const item = fused.get(result.id);

      item.rrfScore += 1 / (RRF_K + index + 1);

      if (type === "semantic") {
        item.semanticScore = result.semanticScore;
      } else {
        item.bm25Score = result.bm25Score;
      }
    });
  }

  addResults(semanticResults, "semantic");
  addResults(keywordResults, "keyword");

  return [...fused.values()].sort(
    (a, b) => b.rrfScore - a.rrfScore
  );
}

// --------------------------------------------------
// 6. Retrieval evaluation metrics
// --------------------------------------------------

function matchesExpectedPages(result, expectedPages) {
  const start = getPageNumber(result.chunk.pageStart);
  const end = getPageNumber(result.chunk.pageEnd);

  if (start === null || end === null) return false;

  return expectedPages.some(
    (range) => start <= range.end && end >= range.start
  );
}

function createMetrics() {
  return {
    queries: 0,
    hits: 0,
    reciprocalRankSum: 0,
  };
}

function recordMetrics(metrics, results, expectedPages) {
  metrics.queries++;

  const rank = results
    .slice(0, TOP_K)
    .findIndex((result) =>
      matchesExpectedPages(result, expectedPages)
    );

  if (rank !== -1) {
    metrics.hits++;
    metrics.reciprocalRankSum += 1 / (rank + 1);
  }
}

function printMetrics(label, metrics) {
  const hitRate =
    metrics.queries > 0
      ? metrics.hits / metrics.queries
      : 0;

  const mrr =
    metrics.queries > 0
      ? metrics.reciprocalRankSum / metrics.queries
      : 0;

  console.log(`\n${label}`);
  console.log(`Queries: ${metrics.queries}`);
  console.log(`Page matches: ${metrics.hits}`);
  console.log(`Hit@${TOP_K}: ${(hitRate * 100).toFixed(1)}%`);
  console.log(`MRR@${TOP_K}: ${mrr.toFixed(3)}`);
}

// --------------------------------------------------
// 7. Output helpers
// --------------------------------------------------

function printTopResults(title, results, scoreType) {
  console.log(`\n${title}`);

  for (const [index, result] of results.slice(0, TOP_K).entries()) {
    const chunk = result.chunk;

    const rawScore =
      scoreType === "semantic"
        ? result.semanticScore
        : result.rrfScore;

    const score = Number(rawScore ?? 0).toFixed(4);

    console.log(
      `#${index + 1} | ${scoreType}=${score} | ` +
        `${describeChunkSource(chunk)} | ID=${result.id}`
    );

    const sourceUrl = getSourceUrl(chunk);

    if (sourceUrl) {
      console.log(`   URL: ${sourceUrl}`);
    }
  }
}

function printExcerpts(results) {
  console.log("\nTop semantic excerpts for scope review:");

  for (const result of results.slice(0, 2)) {
    const chunk = result.chunk;

    console.log(
      `\nScore: ${Number(result.semanticScore ?? 0).toFixed(4)} | ` +
        `${describeChunkSource(chunk)} | ID: ${result.id}`
    );

    const sourceUrl = getSourceUrl(chunk);

    if (sourceUrl) {
      console.log(`URL: ${sourceUrl}`);
    }

    console.log(
      String(chunk.text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, EXCERPT_LENGTH)
    );
  }
}

// --------------------------------------------------
// 8. Threshold evaluation
// --------------------------------------------------

function computeThresholdMetrics(records, threshold) {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;

  for (const record of records) {
    const predictedAnswerable = record.score >= threshold;
    const actuallyAnswerable = record.scopeType === "in-scope";

    if (actuallyAnswerable && predictedAnswerable) tp++;
    else if (actuallyAnswerable && !predictedAnswerable) fn++;
    else if (!actuallyAnswerable && predictedAnswerable) fp++;
    else tn++;
  }

  const precision =
    tp + fp > 0 ? tp / (tp + fp) : 0;

  const recall =
    tp + fn > 0 ? tp / (tp + fn) : 0;

  const specificity =
    tn + fp > 0 ? tn / (tn + fp) : 0;

  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) /
        (precision + recall)
      : 0;

  return {
    tp,
    fn,
    fp,
    tn,
    precision,
    recall,
    specificity,
    f1,
  };
}

function printThresholdSweep(records, borderlineRecords) {
  console.log("\n" + "=".repeat(90));
  console.log("OFFLINE THRESHOLD SWEEP — CONFIRMED LABELS ONLY");

  console.log(
    "Included: known in-scope questions + clearly unrelated questions."
  );

  console.log(
    "Excluded from confusion-matrix metrics: PostgreSQL-specific borderline cases."
  );

  console.log(
    "\nThreshold | TP | FN | FP | TN | Precision | Recall | Specificity | F1"
  );

  for (const threshold of CANDIDATE_THRESHOLDS) {
    const metrics = computeThresholdMetrics(
      records,
      threshold
    );

    console.log(
      `${threshold.toFixed(2).padEnd(9)} | ` +
        `${String(metrics.tp).padEnd(2)} | ` +
        `${String(metrics.fn).padEnd(2)} | ` +
        `${String(metrics.fp).padEnd(2)} | ` +
        `${String(metrics.tn).padEnd(2)} | ` +
        `${(metrics.precision * 100).toFixed(1).padStart(8)}% | ` +
        `${(metrics.recall * 100).toFixed(1).padStart(5)}% | ` +
        `${(metrics.specificity * 100).toFixed(1).padStart(10)}% | ` +
        `${metrics.f1.toFixed(3)}`
    );
  }

  console.log(
    "\nBORDERLINE POSTGRESQL QUESTIONS — NOT SCORED AS TRUE NEGATIVES"
  );

  for (const threshold of CANDIDATE_THRESHOLDS) {
    const accepted = borderlineRecords.filter(
      (record) => record.score >= threshold
    );

    const rejected = borderlineRecords.filter(
      (record) => record.score < threshold
    );

    console.log(
      `Threshold ${threshold.toFixed(2)}: ` +
        `${accepted.length} would pass, ${rejected.length} would be rejected`
    );

    for (const record of accepted) {
      console.log(
        `  PASS ${record.score.toFixed(4)} — ${record.question}`
      );
    }
  }
}

// --------------------------------------------------
// 9. Main evaluation
// --------------------------------------------------

async function main() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error(
      "PINECONE_API_KEY is missing from backend/.env"
    );
  }

  const raw = await readFile(
    new URL(
      "output/expanded-postgresql-200-pages.json",
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

  // Retain full metadata from the expanded local corpus.
  const chunkById = new Map(
    chunks.map((chunk) => [chunk.id, chunk])
  );

  const bm25Index = buildBm25Index(chunks);

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pc.index({
    name: INDEX_NAME,
    namespace: NAMESPACE,
  });

  const semanticMetrics = createMetrics();
  const hybridMetrics = createMetrics();

  const thresholdRecords = [];
  const borderlineRecords = [];

  console.log("Retrieval Evaluation");
  console.log(`Corpus chunks: ${chunks.length}`);
  console.log(`Semantic candidates: ${CANDIDATE_K}`);
  console.log(`BM25 candidates: ${CANDIDATE_K}`);
  console.log(`Final ranking size: ${TOP_K}`);
  console.log(`Test questions: ${TEST_CASES.length}`);

  for (const testCase of TEST_CASES) {
    console.log("\n" + "=".repeat(70));
    console.log(`Question: ${testCase.question}`);

    const response = await index.searchRecords({
      query: {
        topK: CANDIDATE_K,
        inputs: {
          text: testCase.question,
        },
      },
    });

    const semanticResults = getHits(response)
      .map((hit) => {
        const id = hit._id ?? hit.id;

        const fields =
          hit.fields ?? hit.record ?? hit.metadata ?? hit;

        const localChunk = chunkById.get(id) ?? {};

        const source =
          fields.source ??
          localChunk.source ??
          "Unknown source";

        const chunk = {
          ...localChunk,
          id,
          text:
            fields.text ??
            fields.chunk_text ??
            localChunk.text ??
            "",
          source,
          sourceUrl:
            fields.sourceUrl ??
            fields.source_url ??
            localChunk.sourceUrl ??
            (String(source).startsWith("http")
              ? source
              : null),
          sourceTitle:
            fields.sourceTitle ??
            fields.source_title ??
            localChunk.sourceTitle ??
            null,
          topic:
            fields.topic ??
            localChunk.topic ??
            null,
          section:
            fields.section ??
            localChunk.section ??
            null,
          pageStart:
            fields.pageStart ??
            fields.page_start ??
            localChunk.pageStart ??
            null,
          pageEnd:
            fields.pageEnd ??
            fields.page_end ??
            localChunk.pageEnd ??
            null,
        };

        if (!chunk.text) return null;

        return {
          id,
          chunk,
          semanticScore: hit._score ?? hit.score ?? null,
        };
      })
      .filter(Boolean);

    const keywordResults = searchBm25(
      bm25Index,
      testCase.question,
      CANDIDATE_K
    );

    const hybridResults = fuseWithRrf(
      semanticResults,
      keywordResults
    );

    const highestSemanticScore = semanticResults.reduce(
      (highest, result) =>
        Math.max(
          highest,
          Number(result.semanticScore ?? 0)
        ),
      0
    );

    console.log(
      `Highest semantic score: ${highestSemanticScore.toFixed(4)}`
    );

    printTopResults(
      "Semantic search (top 5)",
      semanticResults,
      "semantic"
    );

    printTopResults(
      "Hybrid search: BM25 + semantic + RRF (top 5)",
      hybridResults,
      "RRF"
    );

    if (testCase.scopeType === "in-scope") {
      recordMetrics(
        semanticMetrics,
        semanticResults,
        testCase.expectedPages
      );

      recordMetrics(
        hybridMetrics,
        hybridResults,
        testCase.expectedPages
      );

      const score = {
        question: testCase.question,
        score: highestSemanticScore,
        scopeType: testCase.scopeType,
      };

      thresholdRecords.push(score);

      const semanticRank = semanticResults
        .slice(0, TOP_K)
        .findIndex((result) =>
          matchesExpectedPages(
            result,
            testCase.expectedPages
          )
        );

      const hybridRank = hybridResults
        .slice(0, TOP_K)
        .findIndex((result) =>
          matchesExpectedPages(
            result,
            testCase.expectedPages
          )
        );

      console.log(
        `Page-match rank: semantic=${
          semanticRank < 0
            ? "not in top 5"
            : semanticRank + 1
        }, hybrid=${
          hybridRank < 0
            ? "not in top 5"
            : hybridRank + 1
        }`
      );
    } else {
      printExcerpts(semanticResults);

      const record = {
        question: testCase.question,
        score: highestSemanticScore,
        scopeType: testCase.scopeType,
      };

      if (testCase.scopeType === "unrelated") {
        thresholdRecords.push(record);
      } else {
        borderlineRecords.push(record);
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("IN-SCOPE RETRIEVAL COMPARISON");

  printMetrics("Semantic baseline", semanticMetrics);
  printMetrics("Hybrid retrieval", hybridMetrics);

  printThresholdSweep(
    thresholdRecords,
    borderlineRecords
  );

  console.log("\nEvaluation complete.");

  console.log(
    "This threshold sweep is offline only. No cutoff has been applied " +
      "to askHybrid.js."
  );

  console.log(
    "The borderline PostgreSQL questions need manual scope labels " +
      "before final threshold selection."
  );
}

main().catch((error) => {
  console.error("Evaluation failed:", error.message);
  process.exitCode = 1;
});