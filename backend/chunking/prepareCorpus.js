import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

const PDF_PATH = "../data/postgresql-19-A4.pdf";
const OUTPUT_PATH = "./output/postgresql-200-pages.json";

const START_PAGE = 42;
const END_PAGE = 241;

async function main() {
    let parser;

    try {
        console.log("Reading PostgreSQL PDF...");

        const buffer = await fs.readFile(PDF_PATH);

        parser = new PDFParse({
            data: buffer
        });

        console.log(
            `Extracting pages ${START_PAGE}-${END_PAGE}...`
        );

        const result = await parser.getText({
            partial: Array.from(
                { length: END_PAGE - START_PAGE + 1 },
                (_, i) => START_PAGE + i
            )
        });

        const pages = result.pages.map((page) => ({
            page: page.num,
            text: page.text.trim()
        }));

        await fs.mkdir("./output", {
            recursive: true
        });

        await fs.writeFile(
            OUTPUT_PATH,
            JSON.stringify(pages, null, 2),
            "utf-8"
        );

        console.log("\n========================================");
        console.log("CORPUS CREATED");
        console.log("========================================");

        console.log(`Pages: ${pages.length}`);
        console.log(`First page: ${pages[0]?.page}`);
        console.log(
            `Last page: ${pages[pages.length - 1]?.page}`
        );
        console.log(
            `Saved to: ${OUTPUT_PATH}`
        );

    } catch (error) {
        console.error(
            "\nFailed to prepare corpus:"
        );
        console.error(error);
    } finally {
        if (parser) {
            await parser.destroy();
        }
    }
}

main();