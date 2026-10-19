import { marked } from "marked";
import {
  escapeHTML,
  plainHTML,
  sanitize,
  readingRoot,
  htmlDownload,
  FONTS,
} from "./reading.js";

export const EXTENSIONS = [
  "pdf",
  "docx",
  "epub",
  "odt",
  "rtf",
  "html",
  "htm",
  "xhtml",
  "md",
  "markdown",
  "txt",
  "text",
  "log",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "tex",
  "srt",
  "vtt",
];
const structured = new Set([
  "pdf",
  "docx",
  "epub",
  "odt",
  "rtf",
  "html",
  "htm",
  "xhtml",
]);
export const MAX_SIZE = 25 * 1024 * 1024;
const MAX_TEXT = 1500000;
function decode(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 255 && bytes[1] === 254)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 254 && bytes[1] === 255)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
function delimitedHTML(text, delimiter) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || value === "")) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
    if (rows.length > 10000 || row.length > 200)
      throw new Error(
        "This table is too large to preview. Use up to 10,000 rows and 200 columns.",
      );
  }
  if (quoted)
    throw new Error(
      "This table has an unclosed quoted field. Please check the file.",
    );
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return `<table><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
export async function importFile(file, progress = () => {}) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!EXTENSIONS.includes(ext))
    throw new Error(
      `That file type is not supported yet. Try PDF, DOCX, EPUB, ODT, RTF, HTML, Markdown, or a text file. Legacy .doc files need to be saved as .docx first.`,
    );
  if (file.size > MAX_SIZE)
    throw new Error(
      "This file is larger than 25 MB. Please choose a smaller document.",
    );
  if (!file.size)
    throw new Error(
      "This file is empty. Please choose a document with some text.",
    );
  progress(`Opening ${file.name}…`);
  const buffer = await file.arrayBuffer();
  let html = "",
    notice = "";
  if (ext === "pdf") {
    const result = await (await import("./pdf.js")).readPDF(buffer, progress);
    html = result.html;
    notice = result.notice;
  } else if (["docx", "epub", "odt"].includes(ext)) {
    const archive = await import("./archive.js");
    const zip = await archive.openArchive(buffer);
    html = await {
      docx: archive.readDOCX,
      epub: archive.readEPUB,
      odt: archive.readODT,
    }[ext](zip);
    notice =
      ext === "docx"
        ? "The preview focuses on text, headings, and tables. The Word download retains images, links, and document structure. Fonts must be installed on the device used to open the file."
        : ext === "epub"
          ? "Chapters follow the ebook’s reading order. The EPUB download retains its chapters, links, and images; your ebook reader may override reading styles."
          : "The preview focuses on document text and tables. The ODT download retains its document structure and media. Fonts must be installed on the device used to open the file.";
  } else {
    const text = decode(buffer);
    if (
      text.length > MAX_TEXT &&
      !["html", "htm", "xhtml", "rtf"].includes(ext)
    )
      throw new Error(
        "This document has too much text. Please split it into files with fewer than 1.5 million characters.",
      );
    if (text.includes("\0"))
      throw new Error(
        "This looks like a binary file. Please choose a supported text or document format.",
      );
    if (["html", "htm", "xhtml"].includes(ext)) html = sanitize(text);
    else if (["md", "markdown"].includes(ext))
      html = sanitize(marked.parse(text));
    else if (ext === "rtf") {
      html = (await import("./rtf.js")).readRTF(text);
      notice =
        "RTF reading editions preserve text and basic emphasis, with a fresh layout. Embedded images and complex page formatting are not included.";
    } else if (ext === "csv" || ext === "tsv")
      html = delimitedHTML(text, ext === "csv" ? "," : "\t");
    else if (["json", "xml", "yaml", "yml", "tex", "log"].includes(ext))
      html = `<pre><code>${escapeHTML(text)}</code></pre>`;
    else html = plainHTML(text);
    if (!structured.has(ext))
      notice = `${ext.toUpperCase()} downloads keep the original bytes and syntax intact. To include word focus, fonts, and reading styles, download HTML or PDF instead.`;
  }
  html = sanitize(html);
  const check = document.createElement("div");
  check.innerHTML = html;
  if (!check.textContent.trim())
    throw new Error(
      "No readable text was found in this document. Try a document with selectable text.",
    );
  if (check.textContent.length > MAX_TEXT)
    throw new Error(
      "This document has too much text. Please split it into smaller files.",
    );
  return { name: file.name, ext, html, buffer, notice };
}
export function exportChoices(doc) {
  const items = [
    { value: doc.ext, label: `${doc.ext.toUpperCase()} · original type` },
  ];
  if (!["html", "htm", "xhtml"].includes(doc.ext))
    items.push({ value: "html", label: "HTML · styled" });
  if (doc.ext !== "pdf") items.push({ value: "pdf", label: "PDF · styled" });
  return items;
}
export async function exportDocument(
  doc,
  settings,
  format,
  progress = () => {},
) {
  if (format === "pdf")
    return (await import("./pdf.js")).writePDF(
      readingRoot(doc.html, settings),
      settings,
      doc.name,
      progress,
    );
  if (["html", "htm", "xhtml"].includes(format))
    return htmlDownload(doc.html, settings, doc.name, format === "xhtml");
  if (format === "docx")
    return (await import("./archive.js")).writeDOCX(doc.buffer, settings);
  if (format === "epub")
    return (await import("./archive.js")).writeEPUB(doc.buffer, settings);
  if (format === "odt")
    return (await import("./archive.js")).writeODT(doc.buffer, settings);
  if (format === "rtf")
    return (await import("./rtf.js")).writeRTF(
      readingRoot(doc.html, settings),
      settings,
      FONTS[settings.font].name,
    );
  return new Blob([doc.buffer], {
    type:
      format === "md"
        ? "text/markdown;charset=utf-8"
        : format === "json"
          ? "application/json"
          : "text/plain;charset=utf-8",
  });
}
