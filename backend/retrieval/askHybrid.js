
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// --------------------------------------------------
// 0. Environment configuration
// --------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// --------------------------------------------------
// 1. Configuration
// --------------------------------------------------

// Pinecone
const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";

// Hybrid retrieval
const SEMANTIC_CANDIDATES = 30;
const KEYWORD_CANDIDATES = 30;
const TOP_K = 5;
const RRF_K = 60;

// Relevance threshold
const MIN_SEMANTIC_SCORE = 0.42;

// Gemini
const MODEL = "gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS = 1000;
const MAX_RETRY_ATTEMPTS = 4;

// Conversational memory limits
const MAX_MEMORY_TURNS = 6;
const MAX_HISTORY_ANSWER_LENGTH = 2000;

// --------------------------------------------------
// 2. Environment and response helpers
// --------------------------------------------------

function validateEnvironment() {
  const required = [
    "PINECONE_API_KEY",
    "GOOGLE_API_KEY",
  ];

  const missing = required.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }
}

function getHits(response) {
  return (
    response?.result?.hits ??
    response?.matches ??
    response?.result?.matches ??
    []
  );
}

// --------------------------------------------------
// 3. BM25 keyword retrieval
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
        1 + (totalDocuments - df + 0.5) / (df + 0.5)
      );

      const normalization =
        K1 *
        (1 - B + B * (document.length / (averageLength || 1)));

      score +=
        idf *
        ((tf * (K1 + 1)) / (tf + normalization));
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
// 4. Technical-term coverage fallback
// --------------------------------------------------

function hasSubstantiveTechnicalCoverage(chunk, term) {
  const text = String(chunk?.text ?? "").toLowerCase();

  // Remove Markdown formatting while preserving underscores.
  const normalizedText = text
    .replace(/[`*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (term === "shared_buffers") {
    const heading =
      /shared_buffers\s*\(\s*integer\s*\)/i.exec(
        normalizedText
      );

    if (!heading) return false;

    const definition = normalizedText.slice(
      heading.index + heading[0].length,
      heading.index + heading[0].length + 700
    );

    return /sets the amount of memory/i.test(definition);
  }

  if (term === "work_mem") {
    const heading =
      /work_mem\s*\(\s*integer\s*\)/i.exec(
        normalizedText
      );

    if (!heading) return false;

    const definition = normalizedText.slice(
      heading.index + heading[0].length,
      heading.index + heading[0].length + 700
    );

    return /sets the base maximum amount of memory/i.test(
      definition
    );
  }

  return false;
}

function ensureTechnicalTermCoverage(
  results,
  question,
  allKeywordCandidates
) {
  const supportedSettings = new Set([
    "shared_buffers",
    "work_mem",
  ]);

  const technicalTerms = [
    ...new Set(
      tokenize(question).filter((token) =>
        supportedSettings.has(token)
      )
    ),
  ];

  if (technicalTerms.length === 0) {
    return results;
  }

  const augmentedResults = [...results];

  for (const term of technicalTerms) {
    // Check whether the current context contains
    // the actual definition of the setting.
    const alreadyCovered = augmentedResults.some(
      ({ chunk }) =>
        hasSubstantiveTechnicalCoverage(chunk, term)
    );

    if (alreadyCovered) continue;

    // Search the complete corpus for the definition.
    const fallback = allKeywordCandidates.find(
      ({ chunk }) =>
        hasSubstantiveTechnicalCoverage(chunk, term)
    );

    if (!fallback) {
      console.log(
        `No substantive documentation found for "${term}".`
      );
      continue;
    }

    const id = fallback.id ?? fallback.chunk?.id;

    if (!id) continue;

    const alreadyIncluded = augmentedResults.some(
      (item) =>
        item.id === id || item.chunk?.id === id
    );

    if (alreadyIncluded) continue;

    augmentedResults.push({
      ...fallback,
      id,
      chunk: fallback.chunk,
      rrfScore: 0,
      semanticScore: null,
      semanticRank: null,
      keywordRank: null,
    });

    console.log(
      `Added substantive context for "${term}": ${id}`
    );
  }

  return augmentedResults;
}

// --------------------------------------------------
// 5. Reciprocal Rank Fusion
// --------------------------------------------------

function fuseWithRrf(semanticResults, keywordResults) {
  const fused = new Map();

  function addRankedResults(results, type) {
    results.forEach((result, index) => {
      const id = result.id;

      if (!id) return;

      if (!fused.has(id)) {
        fused.set(id, {
          id,
          chunk: result.chunk,
          rrfScore: 0,
          semanticScore: null,
          bm25Score: null,
        });
      }

      const item = fused.get(id);

      item.rrfScore += 1 / (RRF_K + index + 1);

      if (type === "semantic") {
        item.semanticScore = result.semanticScore;
      } else {
        item.bm25Score = result.bm25Score;
      }
    });
  }

  addRankedResults(semanticResults, "semantic");
  addRankedResults(keywordResults, "keyword");

  return [...fused.values()].sort(
    (a, b) => b.rrfScore - a.rrfScore
  );
}

// --------------------------------------------------
// 6. Hybrid retrieval
// --------------------------------------------------

async function retrieveHybrid(
  pineconeIndex,
  question,
  bm25Index,
  chunkById
) {
  // A. Semantic retrieval from Pinecone.
  const response = await pineconeIndex.searchRecords({
    query: {
      topK: SEMANTIC_CANDIDATES,
      inputs: {
        text: question,
      },
    },
  });

  const semanticResults = getHits(response)
    .map((hit) => {
      const id = hit._id ?? hit.id;

      const fields =
        hit.fields ?? hit.record ?? hit.metadata ?? hit;

      const chunk = chunkById.get(id) ?? {
        id,
        source: fields.source ?? "Unknown source",

        sourceUrl:
          fields.sourceUrl ??
          fields.source_url ??
          (String(fields.source ?? "").startsWith("http")
            ? fields.source
            : null),

        sourceTitle:
          fields.sourceTitle ??
          fields.source_title ??
          null,

        topic: fields.topic ?? null,
        section: fields.section ?? null,

        pageStart:
          fields.pageStart ??
          fields.page_start ??
          null,

        pageEnd:
          fields.pageEnd ??
          fields.page_end ??
          null,

        text: fields.text ?? fields.chunk_text ?? "",
      };

      if (!chunk.text) return null;

      return {
        id,
        chunk,
        semanticScore: hit._score ?? hit.score ?? null,
      };
    })
    .filter(Boolean);

  // B. Keyword retrieval using BM25.
  const keywordResults = searchBm25(
    bm25Index,
    question,
    KEYWORD_CANDIDATES
  );

  // C. Combine rankings using RRF.
  const fused = fuseWithRrf(
    semanticResults,
    keywordResults
  );

  // D. Detect supported technical settings.
  const needsSettingsContext = tokenize(question).some(
    (token) =>
      token === "shared_buffers" ||
      token === "work_mem"
  );

  // E. Search the complete corpus when needed.
  const allKeywordCandidates = needsSettingsContext
    ? searchBm25(
        bm25Index,
        question,
        bm25Index.totalDocuments
      )
    : [];

  // F. Append missing technical definitions.
  const results = ensureTechnicalTermCoverage(
    fused.slice(0, TOP_K),
    question,
    allKeywordCandidates
  );

  return {
    semanticResults,
    keywordResults,
    results,
  };
}

// --------------------------------------------------
// 7. Gemini retry handling
// --------------------------------------------------

function isRetryableError(error) {
  const message = String(error?.message ?? "");

  const codeMatch = message.match(
    /"code"\s*:\s*(429|500|502|503|504)/
  );

  const status = Number(
    error?.status ??
      error?.error?.code ??
      codeMatch?.[1]
  );

  return (
    [429, 500, 502, 503, 504].includes(status) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|temporarily unavailable/i.test(
      message
    )
  );
}

async function generateWithRetry(ai, request) {
  for (
    let attempt = 1;
    attempt <= MAX_RETRY_ATTEMPTS;
    attempt++
  ) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (
        !isRetryableError(error) ||
        attempt === MAX_RETRY_ATTEMPTS
      ) {
        throw error;
      }

      const delayMs = Math.min(
        1000 * 2 ** (attempt - 1),
        8000
      );

      console.warn(
        `Temporary Gemini error. Retrying in ${
          delayMs / 1000
        }s (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}).`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  throw new Error("Gemini generation failed after retries.");
}

// --------------------------------------------------
// 8. Conversational context and query rewriting
// --------------------------------------------------

function sanitizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) {
    return [];
  }

  return conversationHistory
    .filter(
      (turn) =>
        typeof turn?.question === "string" &&
        typeof turn?.answer === "string"
    )
    .slice(-MAX_MEMORY_TURNS)
    .map((turn) => ({
      question: turn.question
        .trim()
        .slice(0, 1000),

      answer: turn.answer
        .trim()
        .slice(0, MAX_HISTORY_ANSWER_LENGTH),
    }))
    .filter(
      (turn) => turn.question && turn.answer
    );
}

async function resolveContextualQuestion(
  ai,
  question,
  conversationHistory = []
) {
  // No previous conversation means no rewriting is needed.
  if (conversationHistory.length === 0) {
    return question;
  }

  const historyText = conversationHistory
    .map(
      (turn, index) => `
Turn ${index + 1}
User: ${turn.question}
Assistant: ${turn.answer}
`
    )
    .join("\n");

  const prompt = `
You are a query contextualization component for a PostgreSQL documentation RAG system.

Your task is to rewrite the latest user message as a standalone PostgreSQL documentation search question.

Use the previous conversation to understand references such as:
- it
- this
- that
- they
- what does it help with
- what are its disadvantages
- explain further
- how does that work

Rules:
1. Resolve references using the previous conversation.
2. Preserve the actual intent of the latest user question.
3. If the question is already independent, preserve its meaning.
4. Use the previous conversation only to resolve context.
5. Do not answer the question.
6. Do not introduce unrelated topics.
7. Return only one standalone search question.
8. Do not include explanations or quotation marks.

Previous conversation:
${historyText}

Latest user message:
${question}

Standalone PostgreSQL search question:
`;

  try {
    const response = await generateWithRetry(ai, {
      model: MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 150,
        temperature: 0,
      },
    });

    const contextualizedQuestion = String(
      response.text ?? ""
    )
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "");

    if (!contextualizedQuestion) {
      return question;
    }

    console.log(
      "Contextualized question:",
      contextualizedQuestion
    );

    return contextualizedQuestion;
  } catch (error) {
    console.warn(
      "Contextual query rewriting failed:",
      error.message
    );

    // Conservative fallback: preserve the previous topic.
    const lastTurn =
      conversationHistory[conversationHistory.length - 1];

    if (lastTurn?.question) {
      return `${lastTurn.question}. Follow-up question: ${question}`;
    }

    return question;
  }
}

// --------------------------------------------------
// 9. Source formatting and answer generation
// --------------------------------------------------

function getSourceUrl(chunk) {
  return (
    chunk.sourceUrl ??
    (String(chunk.source ?? "").startsWith("http")
      ? chunk.source
      : null)
  );
}

function buildSources(results) {
  return results.map(({ chunk }, index) => ({
    index: index + 1,
    id: chunk.id ?? null,
    title:
      chunk.sourceTitle ??
      chunk.source ??
      "Unknown source",
    section: chunk.section ?? null,
    topic: chunk.topic ?? null,
    url: getSourceUrl(chunk),
    pageStart: chunk.pageStart ?? null,
    pageEnd: chunk.pageEnd ?? null,
  }));
}

async function generateAnswer(
  ai,
  question,
  contextualizedQuestion,
  results,
  conversationHistory = []
) {
  const sources = buildSources(results);

  if (results.length === 0) {
    return {
      answer: "No relevant documentation chunks were retrieved.",
      sources: [],
    };
  }

  const context = results
    .map(({ chunk }, index) => {
      const sourceUrl = getSourceUrl(chunk);

      const pdfPages =
        chunk.pageStart != null
          ? `${chunk.pageStart}-${chunk.pageEnd ?? chunk.pageStart}`
          : sourceUrl
            ? "Not applicable (HTML documentation source)"
            : "Not available";

      return `
[Source ${index + 1}]
Document: ${chunk.sourceTitle ?? chunk.source ?? "Unknown source"}
Section: ${chunk.section ?? "Not specified"}
Topic: ${chunk.topic ?? "Not specified"}
Source URL: ${sourceUrl ?? "Not available"}
PDF pages: ${pdfPages}
Chunk ID: ${chunk.id ?? "Unknown"}

Content:
${chunk.text}
`;
    })
    .join("\n--------------------\n");

  const conversationContext =
    conversationHistory.length > 0
      ? conversationHistory
          .map(
            (turn, index) => `
Turn ${index + 1}
User: ${turn.question}
Assistant: ${turn.answer}
`
          )
          .join("\n")
      : "No previous conversation.";

  const prompt = `
You are a PostgreSQL documentation assistant.

Answer the user's question using the retrieved documentation.

Conversation context:
${conversationContext}

Original user question:
${question}

Resolved standalone question:
${contextualizedQuestion}

Rules:
1. Answer the resolved standalone question.
2. Use conversation context only to understand references and follow-up intent.
3. Use retrieved documentation as the factual basis for your answer.
4. Do not treat previous assistant responses as authoritative documentation.
5. Do not invent unsupported information.
6. If retrieved context does not contain the answer, explicitly say so.
7. Cite each factual claim using the matching source label, such as [Source 1].
8. For PDF sources, use the supplied filename and PDF page range.
9. For HTML sources, use the supplied document title and section; do not invent page numbers.
10. Do not invent or alter source URLs, section names, SQL, or configuration values.
11. If the documentation contains an exact SQL example relevant to the question, copy it verbatim.
12. Do not claim to have consulted documentation outside the supplied context.
13. Finish with complete sentences.

Retrieved documentation:
${context}

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

  const finishReason =
    response.candidates?.[0]?.finishReason ?? "Unknown";

  console.log("Gemini finish reason:", finishReason);

  const answer = response.text;

  if (!answer) {
    return {
      answer: `Gemini returned no text. Finish reason: ${finishReason}`,
      sources,
    };
  }

  const completedAnswer =
    finishReason === "MAX_TOKENS"
      ? answer +
        "\n\n[Warning: The answer may be incomplete because the token limit was reached.]"
      : answer;

  return {
    answer: completedAnswer.trim(),
    sources,
  };
}

// --------------------------------------------------
// 10. Reusable RAG service
// --------------------------------------------------

export async function createRagAssistant() {
  validateEnvironment();

  // Load the expanded corpus once.
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
    throw new Error(
      "The PostgreSQL documentation corpus is empty or invalid."
    );
  }

  // Local chunk lookup.
  const chunkById = new Map(
    chunks.map((chunk) => [chunk.id, chunk])
  );

  // Build BM25 once at initialization.
  const bm25Index = buildBm25Index(chunks);

  // Initialize Pinecone.
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const pineconeIndex = pc.index({
    name: INDEX_NAME,
    namespace: NAMESPACE,
  });

  // Initialize Gemini.
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  console.log(`Loaded ${chunks.length} documentation chunks.`);
  console.log(`Pinecone index: ${INDEX_NAME}`);
  console.log(`Namespace: ${NAMESPACE}`);
  console.log(`Answer model: ${MODEL}`);

  // ------------------------------------------------
  // Public question-answering method
  // ------------------------------------------------

  async function ask(question, conversationHistory = []) {
    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      throw new Error("A non-empty question is required.");
    }

    const normalizedQuestion = question.trim();

    // Sanitize and limit supplied client-side memory.
    const recentHistory =
      sanitizeConversationHistory(conversationHistory);

    // Step 1: Resolve follow-up references.
    const contextualizedQuestion =
      await resolveContextualQuestion(
        ai,
        normalizedQuestion,
        recentHistory
      );

    // Step 2: Hybrid retrieval using the resolved question.
    const {
      semanticResults,
      keywordResults,
      results,
    } = await retrieveHybrid(
      pineconeIndex,
      contextualizedQuestion,
      bm25Index,
      chunkById
    );

    // Step 3: Calculate best semantic score.
    const bestSemanticScore = semanticResults.reduce(
      (best, result) =>
        Math.max(
          best,
          Number(result.semanticScore ?? 0)
        ),
      0
    );

    const metadata = {
      semanticScore: Number(bestSemanticScore.toFixed(4)),
      threshold: MIN_SEMANTIC_SCORE,
      semanticCandidates: semanticResults.length,
      keywordCandidates: keywordResults.length,
      contextChunks: results.length,
      contextualizedQuestion,
      memoryTurnsUsed: recentHistory.length,
    };

    // Step 4: Apply semantic relevance gate.
    if (bestSemanticScore < MIN_SEMANTIC_SCORE) {
      return {
        status: "abstained",
        answer:
          "I couldn't find sufficiently relevant information in the indexed PostgreSQL documentation to answer this question reliably.",
        sources: [],
        metadata,
      };
    }

    // Step 5: Generate answer using retrieved documentation
    // and supplied conversation context.
    const generated = await generateAnswer(
      ai,
      normalizedQuestion,
      contextualizedQuestion,
      results,
      recentHistory
    );

    return {
      status: "answered",
      answer: generated.answer,
      sources: generated.sources,
      metadata,
    };
  }

  return {
    ask,
    info: {
      corpusChunks: chunks.length,
      index: INDEX_NAME,
      namespace: NAMESPACE,
      model: MODEL,
      threshold: MIN_SEMANTIC_SCORE,
    },
  };
}

// --------------------------------------------------
// 11. CLI interface for local testing
// --------------------------------------------------

async function main() {
  const assistant = await createRagAssistant();

  const rl = readline.createInterface({
    input,
    output,
  });

  // Temporary local CLI memory.
  // The Express API does not use this variable.
  let conversationHistory = [];

  console.log("\nHybrid PostgreSQL RAG Assistant ready.");
  console.log(`Corpus chunks: ${assistant.info.corpusChunks}`);
  console.log(`Pinecone index: ${assistant.info.index}`);
  console.log(`Namespace: ${assistant.info.namespace}`);
  console.log(`Answer model: ${assistant.info.model}`);

  console.log(
    `Minimum relevance score: ${assistant.info.threshold}`
  );

  console.log('Type "new" to clear memory.');
  console.log('Type "exit" to quit.');

  try {
    while (true) {
      const question = (
        await rl.question("\nAsk a PostgreSQL question: ")
      ).trim();

      if (question.toLowerCase() === "exit") break;

      if (question.toLowerCase() === "new") {
        conversationHistory = [];
        console.log("Conversation context cleared.");
        continue;
      }

      if (!question) continue;

      try {
        console.log("\nRunning hybrid retrieval...");

        const result = await assistant.ask(
          question,
          conversationHistory
        );

        console.log("\nMetadata:");
        console.log(result.metadata);

        console.log("\nAnswer:\n");
        console.log(result.answer);

        if (result.sources.length > 0) {
          console.log("\nSources:");

          result.sources.forEach((source) => {
            const details = [];

            if (source.section) {
              details.push(`Section: ${source.section}`);
            }

            if (source.pageStart != null) {
              details.push(
                `PDF pages: ${source.pageStart}-${source.pageEnd ?? source.pageStart}`
              );
            }

            if (source.url) {
              details.push(source.url);
            }

            console.log(
              `[Source ${source.index}] ${source.title}` +
                (details.length
                  ? ` — ${details.join(" — ")}`
                  : "")
            );
          });
        }

        // Save only successful answers in local CLI memory.
        if (result.status === "answered") {
          conversationHistory.push({
            question,
            answer: result.answer,
          });

          conversationHistory =
            conversationHistory.slice(-MAX_MEMORY_TURNS);
        }
      } catch (error) {
        console.error("\nRequest failed:", error.message);
      }
    }
  } finally {
    rl.close();
  }
}

// --------------------------------------------------
// 12. Run CLI only when this file is executed directly
// --------------------------------------------------

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error("\nApplication failed:", error.message);
    process.exitCode = 1;
  });
}
