
import dotenv from "dotenv";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: "../.env" });

// Pinecone configuration
const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";
const TOP_K = 5;

// Gemini configuration
const MODEL = "gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS = 1000;
const MAX_RETRY_ATTEMPTS = 4;

// Validate environment variables
function validateEnvironment() {
  const requiredKeys = [
    "PINECONE_API_KEY",
    "GOOGLE_API_KEY",
  ];

  const missingKeys = requiredKeys.filter(
    (key) => !process.env[key]
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing environment variables: ${missingKeys.join(", ")}. ` +
      "Check backend/.env"
    );
  }
}

// Read results from Pinecone
function getHits(response) {
  return (
    response?.result?.hits ??
    response?.matches ??
    response?.result?.matches ??
    []
  );
}

// Retrieve relevant documentation chunks
async function retrieveChunks(index, question) {
  const response = await index.searchRecords({
    query: {
      topK: TOP_K,
      inputs: {
        text: question,
      },
    },
  });

  return getHits(response)
    .map((hit) => {
      const fields =
        hit.fields ??
        hit.record ??
        hit.metadata ??
        hit;

      return {
        id: hit._id ?? hit.id ?? "unknown",
        score: hit._score ?? hit.score ?? null,
        source: fields.source ?? "Unknown source",
        pageStart:
          fields.pageStart ?? fields.page_start,
        pageEnd:
          fields.pageEnd ?? fields.page_end,
        text:
          fields.text ?? fields.chunk_text ?? "",
      };
    })
    .filter(
      (chunk) =>
        typeof chunk.text === "string" &&
        chunk.text.trim().length > 0
    );
}

// Identify temporary API errors
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

// Retry Gemini when temporary errors occur
async function generateWithRetry(
  ai,
  request,
  maxAttempts = MAX_RETRY_ATTEMPTS
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (
        !isRetryableError(error) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      const delayMs = Math.min(
        1000 * 2 ** (attempt - 1),
        8000
      );

      console.warn(
        `Temporary Gemini error. Retrying in ` +
        `${delayMs / 1000}s ` +
        `(attempt ${attempt + 1}/${maxAttempts}).`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  throw new Error("Gemini generation failed after retries.");
}

// Generate a grounded answer from retrieved chunks
async function generateAnswer(ai, question, chunks) {
  if (chunks.length === 0) {
    return (
      "I couldn't find relevant information in the " +
      "PostgreSQL documentation."
    );
  }

  const context = chunks
    .map(
      (chunk, index) => `
[Context ${index + 1}]
Source: ${chunk.source}
PDF pages: ${chunk.pageStart ?? "Unknown"}-${chunk.pageEnd ?? "Unknown"}

Content:
${chunk.text}
`
    )
    .join("\n--------------------\n");

  const prompt = `
You are a PostgreSQL documentation assistant.

Answer the user's question using the retrieved documentation.

Instructions:
1. Answer clearly and directly.
2. Use the retrieved context as the factual basis for your answer.
3. Do not invent facts that are not supported by the context.
4. If the context is insufficient, explicitly say so.
5. Cite relevant information using the source filename and PDF page numbers.
6. Do not claim to have consulted documentation beyond the supplied context.
7. Prefer concise paragraphs or bullet points when helpful.
8. Finish with a complete sentence.

Retrieved documentation:
${context}

User question:
${question}

Provide the answer:
`;

  const response = await generateWithRetry(ai, {
    model: MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const finishReason =
    response.candidates?.[0]?.finishReason ?? "Unknown";

  console.log("Gemini finish reason:", finishReason);

  const answer = response.text;

  if (!answer) {
    return `Gemini returned no text. Finish reason: ${finishReason}`;
  }

  if (finishReason === "MAX_TOKENS") {
    return (
      answer +
      "\n\n[Warning: The answer may be incomplete " +
      "because the output token limit was reached.]"
    );
  }

  return answer;
}

// Run the interactive RAG application
async function main() {
  validateEnvironment();

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pc.index({
    name: INDEX_NAME,
    namespace: NAMESPACE,
  });

  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const rl = readline.createInterface({
    input,
    output,
  });

  console.log("\nPostgreSQL RAG Assistant is ready.");
  console.log(`Pinecone index: ${INDEX_NAME}`);
  console.log(`Namespace: ${NAMESPACE}`);
  console.log(`Gemini model: ${MODEL}`);
  console.log('Type "exit" to quit.');

  try {
    while (true) {
      const question = (
        await rl.question("\nAsk a PostgreSQL question: ")
      ).trim();

      if (question.toLowerCase() === "exit") {
        break;
      }

      if (!question) {
        continue;
      }

      try {
        console.log("\nRetrieving relevant documentation...");

        const chunks = await retrieveChunks(index, question);

        console.log(`Retrieved ${chunks.length} chunks.`);

        if (chunks.length > 0) {
          console.log("Retrieved sources:");

          for (const chunk of chunks) {
            console.log(
              `- ${chunk.source}, pages ` +
              `${chunk.pageStart ?? "?"}-` +
              `${chunk.pageEnd ?? "?"}`
            );
          }
        }

        console.log("\nGenerating answer with Gemini...");

        const answer = await generateAnswer(
          ai,
          question,
          chunks
        );

        console.log("\nAnswer:\n");
        console.log(answer);
      } catch (error) {
        console.error("\nRequest failed:", error.message);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Application failed:", error.message);
  process.exitCode = 1;
});
