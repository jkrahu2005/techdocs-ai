
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

dotenv.config({ path: "../.env" });

const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";
const TOP_K = 5;

async function searchDocuments(namespace, question) {
    const response = await namespace.searchRecords({
        query: {
            topK: TOP_K,
            inputs: {
                text: question
            }
        },
        fields: [
            "text",
            "source",
            "strategy",
            "chunkIndex",
            "pageStart",
            "pageEnd"
        ]
    });

    // Handle the response shape returned by Pinecone.
    const hits =
        response?.result?.hits ??
        response?.matches ??
        [];

    if (hits.length === 0) {
        console.log("No matching chunks returned.");
        return;
    }

    console.log(`\nTop ${hits.length} retrieved chunks`);

    hits.forEach((hit, index) => {
        const fields = hit.fields ?? hit.record ?? {};
        const id = hit._id ?? hit.id ?? "unknown";
        const score = hit._score ?? hit.score ?? "unavailable";

        console.log("\n========================================");
        console.log(`Result ${index + 1}`);
        console.log("========================================");

        console.log(`ID: ${id}`);
        console.log(`Similarity score: ${score}`);
        console.log(
            `Pages: ${fields.pageStart ?? "?"} - ${fields.pageEnd ?? "?"}`
        );
        console.log(`Source: ${fields.source ?? "unknown"}`);

        console.log("\nRetrieved text:\n");
        console.log(fields.text ?? "Text field not returned.");
    });
}

async function main() {
    let rl;

    try {
        if (!process.env.PINECONE_API_KEY) {
            throw new Error(
                "PINECONE_API_KEY is missing from backend/.env"
            );
        }

        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });

        const index = pc.index(INDEX_NAME);
        const namespace = index.namespace(NAMESPACE);

        console.log("========================================");
        console.log("POSTGRESQL SEMANTIC RETRIEVAL");
        console.log("========================================");
        console.log(`Index: ${INDEX_NAME}`);
        console.log(`Namespace: ${NAMESPACE}`);
        console.log(`Top K: ${TOP_K}`);

        rl = createInterface({
            input: stdin,
            output: stdout
        });

        while (true) {
            const question = (
                await rl.question(
                    "\nAsk a PostgreSQL question (or type exit): "
                )
            ).trim();

            if (["exit", "quit"].includes(question.toLowerCase())) {
                break;
            }

            if (!question) {
                console.log("Please enter a question.");
                continue;
            }

            console.log("\nSearching Pinecone...");
            await searchDocuments(namespace, question);
        }
    } catch (error) {
        console.error("\nRetrieval failed:");
        console.error(error);
    } finally {
        rl?.close();
    }
}

main();
