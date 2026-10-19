import { escapeHTML, FONTS, THEMES, fontData } from "./reading.js";

export async function readPDF(buffer, progress) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../assets/pdf.worker.min.mjs",
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({
    data: buffer.slice(0),
    isEvalSupported: false,
    cMapUrl: new URL("../assets/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("../assets/standard_fonts/", import.meta.url)
      .href,
    wasmUrl: new URL("../assets/wasm/", import.meta.url).href,
  });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 500)
      throw new Error("Please choose a PDF with 500 pages or fewer.");
    const pages = [];
    let characters = 0;
    let emptyPages = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      progress(`Reading PDF · page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      let text = "",
        previous;
      for (const item of items) {
        if (!("str" in item)) continue;
        if (previous && previous.str && item.str && !/[\s\n]$/.test(text)) {
          const yGap = Math.abs(item.transform[5] - previous.transform[5]);
          const line = Math.max(Math.abs(previous.transform[3]), 8);
          if (yGap > line * 1.7) text += "\n\n";
          else if (yGap > line * 0.45) text += "\n";
          else if (
            item.transform[4] - (previous.transform[4] + previous.width) >
            line * 0.1
          )
            text += " ";
        }
        text += item.str;
        if (item.hasEOL) text += "\n";
        previous = item;
      }
      if (!text.trim()) {
        emptyPages++;
        pages.push(`<p>[Page ${number} has no extractable text]</p>`);
      } else
        pages.push(
          text
            .trim()
            .split(/\n\s*\n/)
            .map(
              (p) =>
                `<p>${escapeHTML(p.replace(/([^\n])\n(?=[^\n])/g, "$1 "))}</p>`,
            )
            .join(""),
        );
      characters += text.length;
      if (characters > 1500000)
        throw new Error(
          "This PDF has too much text. Please split it into smaller files.",
        );
      page.cleanup();
    }
    if (emptyPages === pdf.numPages)
      throw new Error(
        "This PDF has no selectable text. It may be a scan or contain outlined text. Run OCR on it first, then open the searchable PDF here.",
      );
    return {
      html: pages.join("<hr>"),
      notice: `PDF reading edition: text is reflowed into new pages. Images, forms, annotations, and the original page layout are not included.${emptyPages ? ` ${emptyPages} page(s) had no extractable text and are marked in the reader.` : ""}`,
    };
  } catch (error) {
    if (error.name === "PasswordException")
      throw new Error(
        "This PDF is password-protected. Open an unlocked copy instead.",
      );
    throw error;
  } finally {
    await task.destroy();
  }
}
function blocksFromDOM(root) {
  const blocks = [];
  let runs = [],
    heading = 0;
  const flush = () => {
    if (runs.some((r) => r.text.trim())) blocks.push({ runs, heading });
    runs = [];
  };
  const blockTags = new Set([
    "P",
    "DIV",
    "SECTION",
    "ARTICLE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "PRE",
    "BLOCKQUOTE",
    "TR",
  ]);
  function visit(node, bold = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ text: node.data, bold });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === "HR") {
      flush();
      blocks.push({ pageBreak: true });
      return;
    }
    if (tag === "IMG") {
      runs.push({
        text: node.alt ? `[Image: ${node.alt}]` : "[Image]",
        bold: false,
      });
      return;
    }
    if (tag === "BR") {
      runs.push({ text: "\n", bold });
      return;
    }
    const isBlock = blockTags.has(tag),
      oldHeading = heading;
    if (isBlock) {
      flush();
      if (/^H[1-6]$/.test(tag)) heading = Number(tag[1]);
    }
    if (tag === "LI") runs.push({ text: "• ", bold: false });
    for (const child of node.childNodes)
      visit(
        child,
        bold || ["B", "STRONG"].includes(tag) || /^H[1-6]$/.test(tag),
      );
    if (tag === "TD" || tag === "TH") runs.push({ text: "    ", bold: false });
    if (isBlock) {
      flush();
      heading = oldHeading;
    }
  }
  visit(root);
  flush();
  return blocks;
}
export async function writePDF(root, settings, title, progress = () => {}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  const file = FONTS[settings.font].file;
  const regular = ["OpenDyslexic", "AtkinsonHyperlegible"].includes(file)
    ? `${file}-Regular`
    : file;
  const [normal, bold] = await Promise.all([
    fontData(regular),
    fontData(`${file}-Bold`),
  ]);
  pdf.addFileToVFS("reading.ttf", normal);
  pdf.addFont("reading.ttf", "Reading", "normal");
  pdf.addFileToVFS("reading-bold.ttf", bold);
  pdf.addFont("reading-bold.ttf", "Reading", "bold");
  pdf.setFont("Reading", "normal");
  // Refuse an incomplete PDF instead of silently replacing unsupported glyphs with blanks.
  const fonts = ["normal", "bold"].map((style) => {
    pdf.setFont("Reading", style);
    return pdf.getFont().metadata;
  });
  for (const char of new Set(root.textContent)) {
    const code = char.codePointAt(0);
    if (/\s/.test(char)) continue;
    if (code > 65535 || fonts.some((font) => !font.characterToGlyph(code)))
      throw new Error(
        "The selected PDF font does not contain every character in this text. Try Everyday sans, or download HTML to keep the full text with browser font fallback.",
      );
  }
  // jsPDF does not provide full complex-script layout. The browser print path does.
  if (/[\u0590-\u0fff\u1780-\u17ff]/u.test(root.textContent))
    throw new Error(
      "For this writing system, choose Print and save as PDF to keep correct text shaping, or download HTML.",
    );
  const colors = THEMES[settings.theme];
  const pageWidth = pdf.internal.pageSize.getWidth(),
    pageHeight = pdf.internal.pageSize.getHeight();
  const base = settings.size * 0.75,
    spacing = settings.spacing * 0.75;
  const width = Math.min(pageWidth - 96, settings.width * base * 0.52),
    left = (pageWidth - width) / 2;
  let y = 48;
  let pages = 1;
  const background = () => {
    pdf.setFillColor(colors.bg);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setTextColor(colors.ink);
  };
  background();
  pdf.setProperties({
    title,
    subject: "EazyRead reading edition",
    creator: "EazyRead",
  });
  const newPage = () => {
    if (++pages > 1000)
      throw new Error(
        "This reading edition exceeds 1,000 PDF pages. Reduce text size or split the document.",
      );
    pdf.addPage();
    background();
    y = 48;
  };
  let index = 0;
  for (const block of blocksFromDOM(root)) {
    if (block.pageBreak) {
      if (y > 48) newPage();
      continue;
    }
    const size =
        base * (block.heading ? Math.max(1.05, 1.7 - block.heading * 0.15) : 1),
      height = size * settings.line;
    let x = left,
      hasText = false;
    const nextLine = () => {
      y += height;
      x = left;
      hasText = false;
      if (y + height > pageHeight - 48) newPage();
    };
    if (y + height * 2 > pageHeight - 48) newPage();
    pdf.setFontSize(size);
    pdf.setCharSpace(spacing);
    // A word may span several bold/regular runs. Measure and wrap the whole word.
    const tokens = [];
    let word = [];
    const flushWord = () => {
      if (word.length) {
        tokens.push({ parts: word });
        word = [];
      }
    };
    for (const run of block.runs)
      for (const text of run.text.match(/\n|[^\S\n]+|[^\s]+/gu) || []) {
        if (/\s/.test(text)) {
          flushWord();
          tokens.push({ space: text });
        } else if (word.length && word.at(-1).bold === run.bold)
          word.at(-1).text += text;
        else word.push({ text, bold: run.bold });
      }
    flushWord();
    const measure = (part) => {
      pdf.setFont("Reading", part.bold ? "bold" : "normal");
      return pdf.getTextWidth(part.text);
    };
    for (const token of tokens) {
      if (token.space === "\n") {
        nextLine();
        continue;
      }
      if (token.space) {
        if (hasText)
          x += measure({
            text: token.space.replace(/\t/g, "    "),
            bold: false,
          });
        continue;
      }
      const tokenWidth = token.parts.reduce(
        (sum, part) => sum + measure(part),
        0,
      );
      if (x + tokenWidth > left + width && hasText) nextLine();
      for (const part of token.parts) {
        pdf.setFont("Reading", part.bold ? "bold" : "normal");
        if (tokenWidth <= width) {
          pdf.text(part.text, x, y + size);
          x += measure(part);
          hasText = true;
        } else
          for (const char of part.text) {
            const w = measure({ text: char, bold: part.bold });
            if (x + w > left + width && hasText) nextLine();
            pdf.text(char, x, y + size);
            x += w;
            hasText = true;
          }
      }
    }
    y += height + base * 0.5;
    if (++index % 25 === 0) {
      progress(`Creating PDF · ${pages} page${pages === 1 ? "" : "s"}…`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return pdf.output("blob");
}
