
import express from "express";
import cors from "cors";
import "dotenv/config";

import { createRagAssistant } from "./retrieval/askHybrid.js";

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const MAX_QUESTION_LENGTH = 1000;
const MAX_MEMORY_TURNS = 6;
const MAX_HISTORY_ANSWER_LENGTH = 2000;

// Allowed frontend origins.
// Multiple origins can be separated by commas in .env.
const allowedOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// RAG assistant initialized once at server startup.
let ragAssistant = null;

// --------------------------------------------------
// 1. Middleware
// --------------------------------------------------

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, curl and other requests without Origin.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Browser will not receive CORS permission for this origin.
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "50kb" }));

// --------------------------------------------------
// 2. Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.status(ragAssistant ? 200 : 503).json({
    success: Boolean(ragAssistant),
    message: "TechDocs AI backend is running",
    ragStatus: ragAssistant ? "ready" : "initializing",
    conversationalMemory: "client-managed",
  });
});

// --------------------------------------------------
// 3. Ask PostgreSQL documentation assistant
// --------------------------------------------------

app.post("/api/ask", async (req, res) => {
  try {
    const {
      question,
      conversationHistory = [],
    } = req.body ?? {};

    // A. Validate question.
    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid question.",
      });
    }

    const normalizedQuestion = question.trim();

    if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`,
      });
    }

    // B. Validate conversation history.
    if (!Array.isArray(conversationHistory)) {
      return res.status(400).json({
        success: false,
        error: "conversationHistory must be an array.",
      });
    }

    // Keep only recent, valid conversation turns.
    const history = conversationHistory
      .filter(
        (turn) =>
          turn &&
          typeof turn.question === "string" &&
          typeof turn.answer === "string"
      )
      .slice(-MAX_MEMORY_TURNS)
      .map((turn) => ({
        question: turn.question
          .trim()
          .slice(0, MAX_QUESTION_LENGTH),

        answer: turn.answer
          .trim()
          .slice(0, MAX_HISTORY_ANSWER_LENGTH),
      }))
      .filter(
        (turn) => turn.question && turn.answer
      );

    // C. Check RAG initialization.
    if (!ragAssistant) {
      return res.status(503).json({
        success: false,
        error: "RAG service is not ready yet.",
      });
    }

    console.log("\n================================");
    console.log("Received question:", normalizedQuestion);
    console.log("Memory turns received:", history.length);
    console.log("================================");

    // D. Pass question and client-provided memory
    // directly to the existing RAG pipeline.
    const result = await ragAssistant.ask(
      normalizedQuestion,
      history
    );

    // E. Return answer, citations and metadata.
    return res.status(200).json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error("Error in /api/ask:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to generate an answer. Please try again.",
    });
  }
});

// --------------------------------------------------
// 4. Unknown routes
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found.",
  });
});

// --------------------------------------------------
// 5. Error handling
// --------------------------------------------------

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON request body.",
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request body is too large.",
    });
  }

  return res.status(500).json({
    success: false,
    error: "Internal server error.",
  });
});

// --------------------------------------------------
// 6. Start server
// --------------------------------------------------

async function startServer() {
  try {
    console.log("Initializing TechDocs AI RAG pipeline...");

    // Initialize corpus, BM25, Pinecone and Gemini once.
    ragAssistant = await createRagAssistant();

    app.listen(PORT, () => {
      console.log(
        `\nTechDocs AI backend running on port ${PORT}`
      );

      console.log(
        `Health: http://localhost:${PORT}/api/health`
      );

      console.log(
        `Ask: POST http://localhost:${PORT}/api/ask`
      );

      console.log(
        "Conversational memory: client-managed"
      );

      console.log(
        "Allowed frontend origins:",
        allowedOrigins
      );
    });

  } catch (error) {
    console.error("Failed to initialize backend:", error);
    process.exit(1);
  }
}

startServer();
