
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: "../.env" });

const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";
const MODEL = "gemini-3.5-flash-lite";
const TOP_K = 5;

async function main() {
  if (!process.env.PINECONE_API_KEY || !process.env.GOOGLE_API_KEY) {
    throw new Error("Check PINECONE_API_KEY and GOOGLE_API_KEY in backend/.env");
  }

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

  const question =
    "What is a schema in PostgreSQL, and what objects can it contain?";

  console.log("Model:", MODEL);
  console.log("Question:", question);
  console.log("\nRetrieving chunks...");

  const response = await index.searchRecords({
    query: {
      topK: TOP_K,
      inputs: { text: question },
    },
  });

  const hits =
    response?.result?.hits ??
    response?.matches ??
    response?.result?.matches ??
    [];

  const chunks = hits
    .map((hit) => {
      const fields = hit.fields ?? hit.record ?? hit.metadata ?? hit;

      return {
        source: fields.source ?? "Unknown source",
        pageStart: fields.pageStart ?? fields.page_start,
        pageEnd: fields.pageEnd ?? fields.page_end,
        text: fields.text ?? fields.chunk_text ?? "",
      };
    })
    .filter((chunk) => chunk.text.trim());

  console.log(`Retrieved ${chunks.length} chunks.`);

  if (chunks.length === 0) {
    throw new Error("No chunks retrieved. Check Pinecone retrieval first.");
  }

  const context = chunks
    .map(
      (chunk, i) => `
[Context ${i + 1}]
Source: ${chunk.source}
PDF pages: ${chunk.pageStart ?? "Unknown"}-${chunk.pageEnd ?? "Unknown"}
${chunk.text}
`
    )
    .join("\n---\n");

  console.log("\nGenerating answer...");

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: `
You are a PostgreSQL documentation assistant.

Answer the question using only the retrieved context.
Be clear and concise. Do not invent unsupported facts.
Cite the source filename and PDF page numbers.
If the context is insufficient, say so.

Retrieved context:
${context}

Question: ${question}
`,
    config: {
      maxOutputTokens: 1000,
    },
  });

  console.log(
    "\nFinish reason:",
    result.candidates?.[0]?.finishReason ?? "Unknown"
  );

  console.log("\nGenerated answer:\n");
  console.log(result.text ?? "No text returned.");
}

main().catch((error) => {
  console.error("\nTest failed:", error.message);
  process.exitCode = 1;
});
