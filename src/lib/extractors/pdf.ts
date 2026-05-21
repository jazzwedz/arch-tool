// PDF text extractor — runs server-side so the route handler stays
// the single trust boundary for uploaded files. pdf-parse v2 wraps
// pdfjs-dist and handles font dictionaries / layout heuristics; we
// just normalise the text and surface the page count.

import { PDFParse } from "pdf-parse"
import { ExtractError, type ExtractedDoc } from "./types"

export async function extractPdf(
  buffer: Buffer,
  filename: string
): Promise<ExtractedDoc> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
  })
  try {
    const result = await parser.getText()
    const text = (result.text || "").trim()
    if (!text) {
      throw new ExtractError(
        `PDF "${filename}" contains no extractable text — it may be a scanned image. Run OCR first or upload a different document.`
      )
    }
    return {
      kind: "pdf",
      name: filename,
      text,
      pages: result.pages?.length,
    }
  } catch (err) {
    if (err instanceof ExtractError) throw err
    throw new ExtractError(
      `Failed to parse PDF "${filename}": ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    try {
      await parser.destroy()
    } catch {
      // ignore cleanup errors
    }
  }
}
