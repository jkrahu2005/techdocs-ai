
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: "../.env" });

const MODELS = [
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is missing from backend/.env"
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const working = [];
  const failed = [];

  console.log("Testing Gemini text-generation models...");
  console.log("Each model gets a short generation request.\n");

  for (const model of MODELS) {
    process.stdout.write(`Testing ${model}... `);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: "Reply with exactly: OK",
        config: {
          maxOutputTokens: 64,
        },
      });

      const answer = response.text?.trim();
      const finishReason =
        response.candidates?.[0]?.finishReason ?? "Unknown";

      if (answer && finishReason !== "MAX_TOKENS") {
        console.log(`WORKING — ${JSON.stringify(answer)}`);
        working.push(model);
      } else {
        console.log(`NO COMPLETE RESPONSE — ${finishReason}`);
        failed.push({ model, reason: finishReason });
      }
    } catch (error) {
      const message = String(error.message ?? error);
      console.log(`FAILED — ${message}`);

      failed.push({
        model,
        reason: message,
      });
    }

    // Avoid sending all requests at once.
    await delay(1000);
  }

  console.log("\n========== RESULTS ==========");

  if (working.length > 0) {
    console.log("\nModels that responded successfully:");

    for (const model of working) {
      console.log(`  ✓ ${model}`);
    }
  } else {
    console.log("\nNo model generated a complete response.");
  }

  if (failed.length > 0) {
    console.log("\nModels that failed:");

    for (const item of failed) {
      console.log(`  ✗ ${item.model}: ${item.reason}`);
    }
  }

  console.log("\n=============================");
  console.log(
    "A successful short test does not guarantee sustained availability."
  );
}

main().catch((error) => {
  console.error("Model test failed:", error.message);
  process.exitCode = 1;
});
