import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";

// --------------------------------------------------
// 1. Configuration
// --------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const MODEL = "gemini-3.5-flash-lite";
const INDEX_NAME = "techdocs-ai";
const NAMESPACE_NAME = "postgresql-200-baseline";

const MIN_SEMANTIC_SCORE = 0.42;
const SEMANTIC_TOP_K = 30;
const BM25_TOP_K = 30;
const FINAL_TOP_K = 5;
const RRF_K = 60;
const MAX_OUTPUT_TOKENS = 1200;
const MAX_RETRIES = 4;

const CORPUS_PATH = path.resolve(
  __dirname,
  "output/expanded-postgresql-200-pages.json"
);

const OUTPUT_DIR = path.resolve(__dirname, "output");

const OUTPUT_PATH = path.join(
  OUTPUT_DIR,
  "answer-evaluation-results.json"
);

const REQUIRED_ENV = [
  "PINECONE_API_KEY",
  "GOOGLE_API_KEY",
];

// --------------------------------------------------
// 2. Evaluation questions
// --------------------------------------------------

const TEST_CASES = [
  {
    id: "A1",
    category: "in_scope",
    question:
      "What is the difference between BEGIN, COMMIT, and ROLLBACK in PostgreSQL?",
  },
  {
    id: "A2",
    category: "in_scope",
    question:
      "How can I access individual elements of an array in PostgreSQL using subscripts?",
  },
  {
    id: "A3",
    category: "in_scope",
    question:
      "What is a PostgreSQL database cluster?",
  },
  {
    id: "A4",
    category: "in_scope",
    question:
      "How does the UPDATE command work in PostgreSQL?",
    requiredExactText:
      "UPDATE mytable SET a = 5, b = 3, c = 1 WHERE a > 0;",
  },
  {
    id: "A5",
    category: "in_scope",
    question:
      "Does PostgreSQL guarantee the order of rows returned by a SELECT query?",
  },
  {
    id: "A6",
    category: "in_scope",
    question:
      "What is a schema in PostgreSQL, and what objects can it contain?",
  },
  {
    id: "A7",
    category: "in_scope",
    question:
      "How do I create a database named mydb in PostgreSQL?",
  },

  {
    id: "N1",
    category: "unrelated",
    question:
      "What is Nvidia's current stock price?",
  },
  {
    id: "N2",
    category: "unrelated",
    question:
      "What will the weather be in Rourkela tomorrow?",
  },
  {
    id: "N3",
    category: "unrelated",
    question:
      "How do I implement React useEffect hooks?",
  },
  {
    id: "N4",
    category: "unrelated",
    question:
      "Who won the latest IPL season?",
  },

  {
    id: "B1",
    category: "borderline",
    question:
      "How do I configure streaming replication in PostgreSQL using pg_basebackup?",
  },
  {
    id: "B2",
    category: "borderline",
    question:
      "How do I configure pg_hba.conf to use scram-sha-256 authentication?",
  },
  {
    id: "B3",
    category: "borderline",
    question:
      "How do I configure WAL archiving and point-in-time recovery in PostgreSQL?",
  },
  {
    id: "B4",
    category: "borderline",
    question:
      "How should I tune autovacuum for a PostgreSQL database with heavy writes?",
  },
  {
    id: "B5",
    category: "borderline",
    question:
      "How do I configure logical replication publications and subscriptions in PostgreSQL?",
  },
  {
    id: "B6",
    category: "borderline",
    question:
      "How can I use EXPLAIN ANALYZE to troubleshoot slow PostgreSQL queries?",
  },
  {
    id: "B7",
    category: "borderline",
    question:
      "How should I tune shared_buffers and work_mem in PostgreSQL?",
  },
];

// --------------------------------------------------
// 3. Environment and clients
// --------------------------------------------------

function validateEnvironment() {
  const missing = REQUIRED_ENV.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }
}

function createClients() {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pinecone.index(INDEX_NAME);
  const namespace = index.namespace(NAMESPACE_NAME);

  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  return { namespace, ai };
}

// --------------------------------------------------
// 4. Load and normalize corpus
// --------------------------------------------------

async function loadCorpus() {
  const raw = await fs.readFile(CORPUS_PATH, "utf8");
  const parsed = JSON.parse(raw);

  const originalChunks = Array.isArray(parsed)
    ? parsed
    : parsed.chunks;

  if (
    !Array.isArray(originalChunks) ||
    originalChunks.length === 0
  ) {
    throw new Error(
      "The baseline corpus is empty or has an invalid format."
    );
  }

  return originalChunks
    .map((chunk, index) => ({
      id:
        chunk.id ??
        `postgresql-baseline-200-${index}`,
      text: String(chunk.text ?? chunk.content ?? ""),
      source: chunk.source ?? "postgresql-19-A4.pdf",
      sourceUrl:
        chunk.sourceUrl ??
        chunk.source_url ??
        (String(chunk.source ?? "").startsWith("http")
          ? chunk.source
          : null),
      sourceTitle:
        chunk.sourceTitle ??
        chunk.source_title ??
        chunk.title ??
        null,
      topic: chunk.topic ?? null,
      section:
        chunk.section ??
        chunk.sectionTitle ??
        chunk.section_title ??
        chunk.heading ??
        null,
      strategy: chunk.strategy ?? null,
      pageStart:
        chunk.pageStart ??
        chunk.page_start ??
        null,
      pageEnd:
        chunk.pageEnd ??
        chunk.page_end ??
        null,
      chunkIndex: chunk.chunkIndex ?? index,
    }))
    .filter((chunk) => chunk.text.trim().length > 0);
}

// --------------------------------------------------
// 5. BM25 keyword retrieval
// --------------------------------------------------

function tokenize(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .match(/[a-z0-9_]+/g) ?? []
  );
}

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
      frequencies,
      length: tokens.length,
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

function searchBm25(query, index, topK = BM25_TOP_K) {
  const queryTokens = [...new Set(tokenize(query))];

  const K1 = 1.5;
  const B = 0.75;

  const scored = index.documents.map((document) => {
    let score = 0;

    for (const token of queryTokens) {
      const tf =
        document.frequencies.get(token) ?? 0;

      if (tf === 0) continue;

      const df =
        index.documentFrequency.get(token) ?? 0;

      const idf = Math.log(
        1 +
          (index.totalDocuments - df + 0.5) /
            (df + 0.5)
      );

      const denominator =
        tf +
        K1 *
          (
            1 -
            B +
            B *
              document.length /
              Math.max(index.averageLength, 1)
          );

      score +=
        idf *
        ((tf * (K1 + 1)) / denominator);
    }

    return {
      chunk: document.chunk,
      bm25Score: score,
    };
  });

  return scored
    .filter((item) => item.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, topK);
}

// --------------------------------------------------
// 6. Technical-term coverage fallback
// --------------------------------------------------

function ensureTechnicalTermCoverage(
  results,
  keywordResults,
  question,
  bm25Index
) {
  const technicalTerms = [
    ...new Set(
      tokenize(question).filter((token) => token.includes("_"))
    ),
  ];

  const augmentedResults = [...results];

  // Search the full local BM25 corpus, not only the top 30.
  const allKeywordCandidates = searchBm25(
    question,
    bm25Index,
    bm25Index.totalDocuments
  );

  for (const term of technicalTerms) {
    const alreadyCovered = augmentedResults.some(
      ({ chunk }) => tokenize(chunk.text).includes(term)
    );

    if (alreadyCovered) continue;

    const fallback = allKeywordCandidates.find(
      ({ chunk }) => tokenize(chunk.text).includes(term)
    );

    if (!fallback) continue;

    const id = fallback.chunk.id;

    const alreadyIncluded = augmentedResults.some(
      (item) => item.chunk.id === id
    );

    if (alreadyIncluded) continue;

    augmentedResults.push({
      id,
      chunk: fallback.chunk,
      semanticScore: null,
      bm25Score: fallback.bm25Score,
      rrfScore: 0,
      semanticRank: null,
      keywordRank: null,
    });

    console.log(
      `Added context for technical term "${term}": ${id}`
    );
  }

  return augmentedResults;
}

// --------------------------------------------------
// 7. Semantic retrieval using Pinecone
// --------------------------------------------------

function normalizeSemanticHit(hit, chunkById) {
  const fields =
    hit.fields ?? hit.record ?? hit.metadata ?? hit;

  const id = hit._id ?? hit.id ?? fields.id;
  const localChunk = chunkById.get(id) ?? {};

  const source =
    fields.source ??
    localChunk.source ??
    "Unknown source";

  return {
    chunk: {
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
        (String(source).startsWith("http") ? source : null),
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
      chunkIndex:
        fields.chunkIndex ??
        localChunk.chunkIndex ??
        null,
    },
    semanticScore: Number(hit._score ?? hit.score ?? 0),
  };
}

async function searchSemantic(namespace, query, chunkById) {
  const response = await namespace.searchRecords({
    query: {
      topK: SEMANTIC_TOP_K,
      inputs: {
        text: query,
      },
    },
  });

  const hits = response?.result?.hits ?? [];

  return hits
    .map((hit) => normalizeSemanticHit(hit, chunkById))
    .filter(
      (item) => item.chunk.text.trim().length > 0
    );
}

// --------------------------------------------------
// 8. Reciprocal Rank Fusion
// --------------------------------------------------

function reciprocalRankFusion(
  semanticResults,
  keywordResults,
  topK = FINAL_TOP_K
) {
  const fused = new Map();

  function addResult(item, rank, source) {
    const id = item.chunk.id;

    if (!fused.has(id)) {
      fused.set(id, {
        chunk: item.chunk,
        rrfScore: 0,
        semanticScore: 0,
        semanticRank: null,
        keywordRank: null,
      });
    }

    const result = fused.get(id);

    result.rrfScore += 1 / (RRF_K + rank);

    if (source === "semantic") {
      result.semanticScore = item.semanticScore;
      result.semanticRank = rank;
    } else {
      result.keywordRank = rank;
    }
  }

  semanticResults.forEach((item, index) => {
    addResult(item, index + 1, "semantic");
  });

  keywordResults.forEach((item, index) => {
    addResult(item, index + 1, "keyword");
  });

  return [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
}

// --------------------------------------------------
// 9. Hybrid retrieval
// --------------------------------------------------

async function retrieveHybrid(
  namespace,
  query,
  bm25Index
) {
  const chunkById = new Map(
    bm25Index.documents.map(({ chunk }) => [
      chunk.id,
      chunk,
    ])
  );

  const [semanticResults, keywordResults] =
    await Promise.all([
      searchSemantic(namespace, query, chunkById),
      Promise.resolve(
        searchBm25(query, bm25Index, BM25_TOP_K)
      ),
    ]);

  const fusedResults = reciprocalRankFusion(
    semanticResults,
    keywordResults,
    FINAL_TOP_K
  );

  const results = ensureTechnicalTermCoverage(
    fusedResults,
    keywordResults,
    query,
    bm25Index
  );

  const highestSemanticScore = semanticResults.reduce(
    (highest, item) =>
      Math.max(highest, item.semanticScore),
    0
  );

  return {
    semanticResults,
    keywordResults,
    results,
    highestSemanticScore,
  };
}

// --------------------------------------------------
// 10. Gemini retry handling
// --------------------------------------------------

function isRetryableError(error) {
  const message = String(error?.message ?? "");

  const status = Number(
    error?.status ??
      error?.error?.code ??
      0
  );

  return (
    [429, 500, 502, 503, 504].includes(status) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|temporarily unavailable/i.test(
      message
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(ai, request) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (
        !isRetryableError(error) ||
        attempt === MAX_RETRIES
      ) {
        throw error;
      }

      const delayMs = Math.min(
        1000 * 2 ** (attempt - 1),
        8000
      );

      console.warn(
        `Temporary Gemini error. Retrying in ${delayMs}ms ` +
          `(${attempt + 1}/${MAX_RETRIES}).`
      );

      await sleep(delayMs);
    }
  }

  throw new Error("Gemini generation failed after retries.");
}

// --------------------------------------------------
// 11. Generate a grounded answer
// --------------------------------------------------

function getSourceUrl(chunk) {
  return (
    chunk.sourceUrl ??
    (String(chunk.source ?? "").startsWith("http")
      ? chunk.source
      : null)
  );
}

function formatContext(results) {
  return results.map((result, index) => {
    const chunk = result.chunk;
    const sourceUrl = getSourceUrl(chunk);

    const pdfPages =
      chunk.pageStart != null
        ? `${chunk.pageStart}-${chunk.pageEnd ?? chunk.pageStart}`
        : sourceUrl
          ? "Not applicable (HTML documentation source)"
          : "Not available";

    return [
      `[Source ${index + 1}]`,
      `Document: ${chunk.sourceTitle ?? chunk.source ?? "Unknown source"}`,
      `Section: ${chunk.section ?? "Not specified"}`,
      `Topic: ${chunk.topic ?? "Not specified"}`,
      `Source URL: ${sourceUrl ?? "Not available"}`,
      `PDF pages: ${pdfPages}`,
      `Chunk ID: ${chunk.id}`,
      "",
      chunk.text,
    ].join("\n");
  }).join("\n\n--------------------\n\n");
}

function formatSourceReferences(results) {
  return results.map((result, index) => {
    const chunk = result.chunk;
    const title =
      chunk.sourceTitle ??
      chunk.source ??
      "Unknown source";

    const sourceUrl = getSourceUrl(chunk);
    const details = [];

    if (chunk.section) {
      details.push(`Section: ${chunk.section}`);
    }

    if (chunk.pageStart != null) {
      details.push(
        `PDF pages: ${chunk.pageStart}-${chunk.pageEnd ?? chunk.pageStart}`
      );
    }

    if (sourceUrl) {
      details.push(sourceUrl);
    }

    return (
      `[Source ${index + 1}] ${title}` +
      (details.length ? ` — ${details.join(" — ")}` : "")
    );
  }).join("\n");
}

async function generateAnswer(ai, question, results) {
  if (results.length === 0) {
    return (
      "The retrieved documentation does not contain enough " +
      "information to answer this question reliably."
    );
  }

  const context = formatContext(results);

  const prompt = `
You are a PostgreSQL documentation assistant.

Answer the question using ONLY the supplied documentation context.

Rules:
1. Give a clear, direct answer when the context supports it.
2. Do not invent facts, syntax, SQL examples, configuration values, or citations.
3. If the context is insufficient, explicitly say that the provided context is insufficient.
4. Cite each factual claim using the matching source label, such as [Source 1].
5. For PDF sources, cite the supplied filename and page range; for HTML sources, cite the supplied document title and section.
6. Do not invent page numbers, section names, URLs, or citations.
7. A table of contents or a section title alone is not enough to support procedural instructions.
8. If the documentation contains an exact SQL example relevant to the question, copy it verbatim. Do not rewrite, reconstruct, or alter its identifiers, values, operators, or assignments.
9. When explaining SQL syntax, preserve the distinction between assignment and comparison.
10. Do not claim to have consulted sources outside the supplied context.
11. If unsure whether an example is correct, omit the example rather than inventing one.

Retrieved documentation:
${context}

Question:
${question}

Answer:
`;

  const response = await generateWithRetry(ai, {
    model: MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
    },
  });

  const answer = String(response.text ?? "").trim();

  if (!answer) return "";

  return (
    `${answer}\n\nSources:\n` +
    formatSourceReferences(results)
  );
}

// --------------------------------------------------
// 12. Classify answer outcomes
// --------------------------------------------------

function detectInsufficientContext(answer) {
  const patterns = [
    /context (?:is|appears to be) insufficient/i,
    /insufficient (?:information|context|documentation)/i,
    /does not contain enough information/i,
    /not enough information (?:is )?(?:provided|available)/i,
    /cannot answer .* reliably/i,
    /can't answer .* reliably/i,
    /cannot be determined from the (?:provided )?context/i,
    /not contained (?:within|in) the provided context/i,
    /the provided context .* does not/i,
    /documentation provided .* insufficient/i,
  ];

  return patterns.some((pattern) => pattern.test(answer));
}

function runRegressionChecks(testCase, answer) {
  const issues = [];

  if (testCase.id === "A4") {
    const expected = testCase.requiredExactText;

    if (!answer.includes(expected)) {
      issues.push({
        code: "A4_EXACT_SQL_EXAMPLE_MISSING",
        severity: "critical",
        message:
          "The answer did not preserve the exact UPDATE example found in the source documentation.",
        expected,
      });
    }
  }

  return issues;
}

function makeManualReview() {
  return {
    correctness: null,
    groundedness: null,
    citationQuality: null,
    abstentionAppropriate: null,
    notes: "",
  };
}

// --------------------------------------------------
// 13. Evaluate one question
// --------------------------------------------------

async function evaluateQuestion(
  testCase,
  namespace,
  bm25Index,
  ai
) {
  const startedAt = Date.now();

  const base = {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    threshold: MIN_SEMANTIC_SCORE,
    status: "error",
    gatePassed: false,
    answerOutcome: "execution_error",
    highestSemanticScore: 0,
    latencyMs: 0,
    answer: "",
    sources: [],
    qualityIssues: [],
    manualReview: makeManualReview(),
  };

  try {
    const retrieval = await retrieveHybrid(
      namespace,
      testCase.question,
      bm25Index
    );

    const {
      results,
      highestSemanticScore,
      semanticResults,
      keywordResults,
    } = retrieval;

    base.highestSemanticScore = Number(
      highestSemanticScore.toFixed(4)
    );

    // Store the fused context used for answer generation.
    base.sources = results.map((item) => ({
      id: item.chunk.id,
      source: item.chunk.source,
      sourceUrl: item.chunk.sourceUrl,
      sourceTitle: item.chunk.sourceTitle,
      topic: item.chunk.topic,
      section: item.chunk.section,
      pageStart: item.chunk.pageStart,
      pageEnd: item.chunk.pageEnd,
      rrfScore: Number(
        (item.rrfScore ?? 0).toFixed(6)
      ),
      semanticScore:
        item.semanticScore == null
          ? null
          : Number(item.semanticScore.toFixed(4)),
      semanticRank: item.semanticRank ?? null,
      keywordRank: item.keywordRank ?? null,
      textPreview: item.chunk.text.slice(0, 500),
    }));

    base.retrievalDiagnostics = {
      semanticTopResults: semanticResults
        .slice(0, 5)
        .map((item) => ({
          id: item.chunk.id,
          semanticScore: Number(
            item.semanticScore.toFixed(4)
          ),
          source: item.chunk.source,
          sourceUrl: item.chunk.sourceUrl,
          sourceTitle: item.chunk.sourceTitle,
          topic: item.chunk.topic,
          section: item.chunk.section,
          pageStart: item.chunk.pageStart,
          pageEnd: item.chunk.pageEnd,
          textPreview: item.chunk.text.slice(0, 250),
        })),

      keywordTopResults: keywordResults
        .slice(0, 5)
        .map((item) => ({
          id: item.chunk.id,
          bm25Score: Number(
            item.bm25Score.toFixed(4)
          ),
          source: item.chunk.source,
          sourceUrl: item.chunk.sourceUrl,
          sourceTitle: item.chunk.sourceTitle,
          topic: item.chunk.topic,
          section: item.chunk.section,
          pageStart: item.chunk.pageStart,
          pageEnd: item.chunk.pageEnd,
          textPreview: item.chunk.text.slice(0, 250),
        })),
    };

    // Relevance gate
    if (highestSemanticScore < MIN_SEMANTIC_SCORE) {
      base.status = "abstained";
      base.gatePassed = false;
      base.answerOutcome = "abstained_relevance_gate";
      base.answer =
        "The retrieved documentation did not meet the relevance threshold, so the question was not answered.";

      return finishResult(base, startedAt);
    }

    base.gatePassed = true;

    // Generate answer
    const answer = await generateAnswer(
      ai,
      testCase.question,
      results
    );

    base.answer = answer;

    if (!answer) {
      base.status = "error";
      base.answerOutcome = "execution_error";
      base.error = "The model returned an empty answer.";

      return finishResult(base, startedAt);
    }

    if (detectInsufficientContext(answer)) {
      base.status = "abstained";
      base.answerOutcome = "abstained_insufficient_context";

      return finishResult(base, startedAt);
    }

    // Check known answer-quality regressions.
    base.qualityIssues = runRegressionChecks(
      testCase,
      answer
    );

    if (base.qualityIssues.length > 0) {
      base.status = "answered_with_quality_issues";
      base.answerOutcome = "answered_with_quality_issues";
    } else {
      base.status = "answered";
      base.answerOutcome = "answered_substantively";
    }

    return finishResult(base, startedAt);
  } catch (error) {
    base.status = "error";
    base.answerOutcome = "execution_error";
    base.error = error?.message ?? String(error);

    return finishResult(base, startedAt);
  }
}

// --------------------------------------------------
// 14. Finish and log individual results
// --------------------------------------------------

function finishResult(result, startedAt) {
  result.latencyMs = Date.now() - startedAt;

  console.log(
    `${result.id} | ${result.category} | ` +
      `score=${result.highestSemanticScore} | ` +
      `gate=${result.gatePassed ? "passed" : "failed"} | ` +
      `outcome=${result.answerOutcome} | ` +
      `latency=${result.latencyMs}ms`
  );

  if (result.qualityIssues.length > 0) {
    for (const issue of result.qualityIssues) {
      console.warn(
        `  QUALITY ISSUE [${issue.code}]: ${issue.message}`
      );
    }
  }

  if (result.error) {
    console.error(`  ERROR: ${result.error}`);
  }

  return result;
}

// --------------------------------------------------
// 15. Build evaluation summary
// --------------------------------------------------

function createSummary(results) {
  const totalQuestions = results.length;

  const passedGate = results.filter(
    (result) => result.gatePassed
  ).length;

  const answeredSubstantively = results.filter(
    (result) =>
      result.answerOutcome === "answered_substantively"
  ).length;

  const answeredWithQualityIssues = results.filter(
    (result) =>
      result.answerOutcome === "answered_with_quality_issues"
  ).length;

  const abstainedByGate = results.filter(
    (result) =>
      result.answerOutcome === "abstained_relevance_gate"
  ).length;

  const abstainedInsufficientContext = results.filter(
    (result) =>
      result.answerOutcome === "abstained_insufficient_context"
  ).length;

  const failed = results.filter(
    (result) =>
      result.answerOutcome === "execution_error"
  ).length;

  const latencies = results.map(
    (result) => result.latencyMs
  );

  const averageLatencyMs =
    totalQuestions > 0
      ? Math.round(
          latencies.reduce((sum, value) => sum + value, 0) /
            totalQuestions
        )
      : 0;

  const byCategory = {};

  for (const result of results) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = {
        total: 0,
        answeredSubstantively: 0,
        answeredWithQualityIssues: 0,
        abstainedByGate: 0,
        abstainedInsufficientContext: 0,
        errors: 0,
      };
    }

    const category = byCategory[result.category];
    category.total++;

    switch (result.answerOutcome) {
      case "answered_substantively":
        category.answeredSubstantively++;
        break;

      case "answered_with_quality_issues":
        category.answeredWithQualityIssues++;
        break;

      case "abstained_relevance_gate":
        category.abstainedByGate++;
        break;

      case "abstained_insufficient_context":
        category.abstainedInsufficientContext++;
        break;

      default:
        category.errors++;
        break;
    }
  }

  return {
    evaluatedAt: new Date().toISOString(),
    model: MODEL,
    index: INDEX_NAME,
    namespace: NAMESPACE_NAME,
    threshold: MIN_SEMANTIC_SCORE,
    totalQuestions,
    passedGate,
    answeredSubstantively,
    answeredWithQualityIssues,
    abstained:
      abstainedByGate + abstainedInsufficientContext,
    abstainedByGate,
    abstainedInsufficientContext,
    failed,
    averageLatencyMs,
    byCategory,
    results,
  };
}

// --------------------------------------------------
// 16. Run evaluation
// --------------------------------------------------

async function main() {
  validateEnvironment();

  console.log("\nHybrid RAG Answer Quality Evaluation");
  console.log("====================================");
  console.log(`Model: ${MODEL}`);
  console.log(`Index: ${INDEX_NAME}`);
  console.log(`Namespace: ${NAMESPACE_NAME}`);
  console.log(`Threshold: ${MIN_SEMANTIC_SCORE}`);
  console.log(`Test questions: ${TEST_CASES.length}\n`);

  console.log("Loading local corpus...");

  const chunks = await loadCorpus();
  console.log(`Loaded ${chunks.length} chunks.`);

  const bm25Index = buildBm25Index(chunks);
  const { namespace, ai } = createClients();

  console.log("Starting evaluation...\n");

  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await evaluateQuestion(
      testCase,
      namespace,
      bm25Index,
      ai
    );

    results.push(result);
  }

  const summary = createSummary(results);

  await fs.mkdir(OUTPUT_DIR, {
    recursive: true,
  });

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log("\n====================================");
  console.log("EVALUATION SUMMARY");
  console.log("====================================");
  console.log(`Total questions: ${summary.totalQuestions}`);
  console.log(`Passed relevance gate: ${summary.passedGate}`);

  console.log(
    `Answered substantively: ${summary.answeredSubstantively}`
  );

  console.log(
    `Answered with quality issues: ${summary.answeredWithQualityIssues}`
  );

  console.log(`Abstained overall: ${summary.abstained}`);
  console.log(`Abstained at relevance gate: ${summary.abstainedByGate}`);

  console.log(
    `Abstained due to insufficient context: ${summary.abstainedInsufficientContext}`
  );

  console.log(`Execution errors: ${summary.failed}`);
  console.log(`Average latency: ${summary.averageLatencyMs}ms`);

  console.log("\nResults by category:");

  for (const [category, stats] of Object.entries(
    summary.byCategory
  )) {
    console.log(
      `${category}: ` +
        `${stats.answeredSubstantively} substantive, ` +
        `${stats.answeredWithQualityIssues} quality issues, ` +
        `${stats.abstainedByGate} gate abstentions, ` +
        `${stats.abstainedInsufficientContext} context abstentions, ` +
        `${stats.errors} errors / ${stats.total} total`
    );
  }

  console.log("\nQuality issues:");

  const issues = results.filter(
    (result) => result.qualityIssues.length > 0
  );

  if (issues.length === 0) {
    console.log("No configured regression checks failed.");
  } else {
    for (const result of issues) {
      console.log(
        `${result.id}: ${result.qualityIssues
          .map((issue) => issue.code)
          .join(", ")}`
      );
    }
  }

  console.log(`\nJSON saved to: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("\nEvaluation failed:", error);
  process.exitCode = 1;
});