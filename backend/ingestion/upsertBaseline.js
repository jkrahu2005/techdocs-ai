import fs from "fs/promises";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config({
    path: "../.env"
});

const INPUT_PATH =
    "../chunking/output/baseline-200-pages.json";

const INDEX_NAME = "techdocs-ai";
const NAMESPACE = "postgresql-200-baseline";

async function main() {
    try {
        console.log("========================================");
        console.log("PINECONE BASELINE INGESTION");
        console.log("========================================");

        // -----------------------------------------
        // Validate environment
        // -----------------------------------------

        if (!process.env.PINECONE_API_KEY) {
            throw new Error(
                "PINECONE_API_KEY is missing in backend/.env"
            );
        }

        console.log(
            "Pinecone API key loaded successfully."
        );

        // -----------------------------------------
        // Load chunks
        // -----------------------------------------

        const chunks = JSON.parse(
            await fs.readFile(
                INPUT_PATH,
                "utf-8"
            )
        );

        console.log(
            `Chunks loaded: ${chunks.length}`
        );

        // -----------------------------------------
        // Create Pinecone client
        // -----------------------------------------

        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });

        const index = pc.index(
            INDEX_NAME
        );

        const namespace = index.namespace(
            NAMESPACE
        );

        // -----------------------------------------
        // Convert chunks to Pinecone records
        // -----------------------------------------

        const records = chunks.map(
            (chunk) => ({
                _id: chunk.id,

                text: chunk.text,

                source: chunk.source,

                strategy: chunk.strategy,

                chunkIndex: chunk.chunkIndex,

                pageStart: chunk.pageStart,

                pageEnd: chunk.pageEnd
            })
        );

        console.log(
            `Records prepared: ${records.length}`
        );

        // -----------------------------------------
        // Upsert in batches
        // -----------------------------------------

        const BATCH_SIZE = 50;

        for (
            let i = 0;
            i < records.length;
            i += BATCH_SIZE
        ) {
            const batch = records.slice(
                i,
                i + BATCH_SIZE
            );

            const start =
                i + 1;

            const end =
                Math.min(
                    i + BATCH_SIZE,
                    records.length
                );

            console.log(
                `Upserting ${start}-${end} / ${records.length}`
            );

            await namespace.upsertRecords({
                records: batch
            });
        }

        // -----------------------------------------
        // Finished
        // -----------------------------------------

        console.log(
            "\n========================================"
        );

        console.log(
            "INGESTION COMPLETE"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Index:       ${INDEX_NAME}`
        );

        console.log(
            `Namespace:   ${NAMESPACE}`
        );

        console.log(
            `Records:     ${records.length}`
        );

    } catch (error) {
        console.error(
            "\nPinecone ingestion failed:"
        );

        console.error(
            error
        );
    }
}

main();