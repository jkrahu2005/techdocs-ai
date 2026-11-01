import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

const filePath = "./data/postgresql-19-A4.pdf";

try {
    // Read PDF
    const buffer = await fs.readFile(filePath);

    // Create parser
    const parser = new PDFParse({
        data: buffer
    });

    // Inspect representative pages across the document
    const result = await parser.getText({
        partial: [42, 200, 1000, 2000, 3000]
    });

    console.log("========================================");
    console.log("PDF INSPECTION");
    console.log("========================================");

    console.log("PDF loaded successfully!");
    console.log("Total pages:", result.total);
    console.log("Pages extracted:", result.pages.length);

    // Print every selected page
    for (const page of result.pages) {
        console.log("\n========================================");
        console.log(`PAGE ${page.num}`);
        console.log("========================================\n");

        console.log(page.text);
    }

    // Clean up parser resources
    await parser.destroy();

} catch (error) {
    console.error("\nPDF inspection failed:");
    console.error(error);
}