import fs from "fs/promises";

const INPUT_PATH = "./output/postgresql-200-pages.json";
const OUTPUT_PATH = "./output/baseline-200-pages.json";

const CHUNK_SIZE = 1500;
const OVERLAP = 200;

function cleanText(text) {
    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function createChunks(pages) {
    const chunks = [];

    let fullText = "";
    const pageRanges = [];

    for (const page of pages) {
        const text = cleanText(page.text);

        if (!text) continue;

        const start = fullText.length;

        fullText += text + "\n\n";

        const end = fullText.length;

        pageRanges.push({
            page: page.page,
            start,
            end
        });
    }

    let start = 0;
    let chunkIndex = 0;

    while (start < fullText.length) {
        const end = Math.min(
            start + CHUNK_SIZE,
            fullText.length
        );

        const text = fullText
            .slice(start, end)
            .trim();

        if (text) {
            const overlappingPages =
                pageRanges.filter(
                    (range) =>
                        range.end > start &&
                        range.start < end
                );

            const pageStart =
                overlappingPages.length
                    ? overlappingPages[0].page
                    : null;

            const pageEnd =
                overlappingPages.length
                    ? overlappingPages[
                        overlappingPages.length - 1
                    ].page
                    : null;

            chunks.push({
                id: `postgresql-baseline-200-${chunkIndex}`,
                strategy: "fixed-size",
                source: "postgresql-19-A4.pdf",

                chunkIndex,

                pageStart,
                pageEnd,

                characters: text.length,

                text
            });

            chunkIndex++;
        }

        start += CHUNK_SIZE - OVERLAP;
    }

    return chunks;
}

async function main() {
    try {
        console.log("========================================");
        console.log("BASELINE CHUNKING — 200 PAGE CORPUS");
        console.log("========================================");

        const raw = await fs.readFile(
            INPUT_PATH,
            "utf-8"
        );

        const pages = JSON.parse(raw);

        console.log(`Pages loaded: ${pages.length}`);

        const chunks = createChunks(pages);

        console.log(
            `Chunks created: ${chunks.length}`
        );

        await fs.mkdir("./output", {
            recursive: true
        });

        await fs.writeFile(
            OUTPUT_PATH,
            JSON.stringify(chunks, null, 2),
            "utf-8"
        );

        const lengths = chunks.map(
            (chunk) => chunk.characters
        );

        const totalCharacters =
            lengths.reduce(
                (sum, value) => sum + value,
                0
            );

        const average =
            chunks.length
                ? Math.round(
                    totalCharacters /
                    chunks.length
                )
                : 0;

        const tinyChunks = chunks.filter(
            (chunk) =>
                chunk.characters < 100
        ).length;

        console.log("\n========================================");
        console.log("RESULT");
        console.log("========================================");

        console.log(
            `Corpus pages:        ${pages.length}`
        );

        console.log(
            `Total chunks:        ${chunks.length}`
        );

        console.log(
            `Chunk size:          ${CHUNK_SIZE}`
        );

        console.log(
            `Overlap:             ${OVERLAP}`
        );

        console.log(
            `Average characters:  ${average}`
        );

        console.log(
            `Chunks <100 chars:   ${tinyChunks}`
        );

        console.log(
            `Saved to:            ${OUTPUT_PATH}`
        );

        console.log(
            "\n========================================"
        );
        console.log("BASELINE COMPLETE");
        console.log(
            "========================================"
        );

    } catch (error) {
        console.error(
            "\nBaseline chunking failed:"
        );
        console.error(error);
    }
}

main();