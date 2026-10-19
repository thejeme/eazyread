import DOMPurify from "dompurify";

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (
    data.attrName === "src" &&
    !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(data.attrValue)
  )
    data.keepAttr = false;
});

export const DEFAULTS = {
  font: "sans",
  size: 22,
  spacing: 0.4,
  line: 1.8,
  focus: 0.33,
  width: 70,
  theme: "paper",
};
export const THEMES = {
  paper: { bg: "#ffffff", ink: "#26312b" },
  sepia: { bg: "#faf2e2", ink: "#493b2b" },
  sage: { bg: "#f0f6ed", ink: "#2f4434" },
  rose: { bg: "#fff5f1", ink: "#513c40" },
  night: { bg: "#202a2b", ink: "#dfe7df" },
  contrast: { bg: "#000000", ink: "#ffffff" },
};
export const FONTS = {
  sans: {
    css: "'Reading Sans', sans-serif",
    file: "DejaVuSans",
    name: "DejaVu Sans",
  },
  serif: {
    css: "'Reading Serif', Georgia, serif",
    file: "DejaVuSerif",
    name: "DejaVu Serif",
  },
  humanist: {
    css: "'Atkinson Hyperlegible', sans-serif",
    file: "AtkinsonHyperlegible",
    name: "Atkinson Hyperlegible",
  },
  mono: {
    css: "'Reading Mono', monospace",
    file: "DejaVuSansMono",
    name: "DejaVu Sans Mono",
  },
  dyslexic: {
    css: "'OpenDyslexic', sans-serif",
    file: "OpenDyslexic",
    name: "OpenDyslexic",
  },
};
export function normalizeSettings(value = {}) {
  const choice = (key, options) =>
    options.includes(value[key]) ? value[key] : DEFAULTS[key];
  return {
    font: choice("font", Object.keys(FONTS)),
    theme: choice("theme", Object.keys(THEMES)),
    size: choice(
      "size",
      Array.from({ length: 23 }, (_, i) => i + 14),
    ),
    spacing: choice("spacing", [0, 0.4, 1, 1.8]),
    line: choice("line", [1.5, 1.8, 2.1]),
    focus: choice("focus", [0, 0.33, 0.5]),
    width: choice("width", [56, 70, 90]),
  };
}
export function escapeHTML(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
export function plainHTML(text) {
  return text
    .split(/\r?\n[\t ]*\r?\n/)
    .map((p) => `<p>${escapeHTML(p)}</p>`)
    .join("");
}
export function sanitize(html) {
  const root = document.createElement("div");
  root.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "section",
      "article",
      "span",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "b",
      "strong",
      "em",
      "i",
      "u",
      "s",
      "del",
      "mark",
      "sub",
      "sup",
      "br",
      "hr",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "caption",
      "a",
      "img",
      "dl",
      "dt",
      "dd",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "alt",
      "src",
      "colspan",
      "rowspan",
      "start",
      "lang",
      "dir",
    ],
    ALLOW_DATA_ATTR: false,
  });
  // Imported documents cannot make network requests, execute code, or override the reader.
  root.querySelectorAll("img").forEach((img) => {
    if (
      !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(
        img.getAttribute("src") || "",
      )
    ) {
      img.replaceWith(
        document.createTextNode(img.alt ? `[Image: ${img.alt}]` : "[Image]"),
      );
    }
  });
  root.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (/^(https?:|mailto:)/i.test(href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else a.removeAttribute("href");
  });
  return root.innerHTML;
}
// Unicode letters and combining marks, excluding punctuation, whitespace, and numbers.
export function focusParts(text, ratio) {
  if (!ratio) return [{ text, bold: false }];
  const result = [];
  let end = 0;
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)) {
    if (match.index > end)
      result.push({ text: text.slice(end, match.index), bold: false });
    const chars = Array.from(match[0]);
    let count = Math.ceil(
      chars.filter((char) => !/\p{M}/u.test(char)).length * ratio,
    );
    let split = 0;
    while (split < chars.length && count > 0) {
      if (!/\p{M}/u.test(chars[split])) count--;
      split++;
    }
    while (split < chars.length && /\p{M}/u.test(chars[split])) split++;
    result.push({ text: chars.slice(0, split).join(""), bold: true });
    if (split < chars.length)
      result.push({ text: chars.slice(split).join(""), bold: false });
    end = match.index + match[0].length;
  }
  if (end < text.length) result.push({ text: text.slice(end), bold: false });
  return result;
}
export function applyFocus(root, ratio) {
  if (!ratio) return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (
      !walker.currentNode.parentElement?.closest(
        "pre,code,script,style,b,strong",
      )
    )
      nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const part of focusParts(node.data, ratio)) {
      if (part.bold) {
        const b = document.createElement("b");
        b.className = "word-focus";
        b.textContent = part.text;
        fragment.append(b);
      } else fragment.append(document.createTextNode(part.text));
    }
    node.replaceWith(fragment);
  }
  return root;
}
export function readingRoot(html, settings) {
  const root = document.createElement("div");
  root.className = "reading-body";
  root.innerHTML = html;
  return applyFocus(root, settings.focus);
}
export function readableText(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  clone.querySelectorAll("td,th").forEach((node) => node.append("\t"));
  clone
    .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr,section,hr")
    .forEach((node) => node.append("\n\n"));
  return clone.textContent.replace(/\n{3,}/g, "\n\n").trim();
}
export function readingCSS(settings, family = FONTS[settings.font].css) {
  const colors = THEMES[settings.theme];
  return `:root{color-scheme:${["night", "contrast"].includes(settings.theme) ? "dark" : "light"}}
body{margin:0;padding:5vw;background:${colors.bg};color:${colors.ink};font-family:${family};font-size:${settings.size}px;line-height:${settings.line};letter-spacing:${settings.spacing}px;overflow-wrap:anywhere}
.reading-body{max-width:${settings.width}ch;margin:auto}p{white-space:pre-wrap;margin:0 0 1.1em}h1,h2,h3,h4{line-height:1.4}b,strong{font-weight:700}a{color:inherit}img{max-width:100%;height:auto}pre{white-space:pre-wrap}table{border-collapse:collapse;width:100%}td,th{border:1px solid currentColor;padding:.5em}blockquote{border-left:3px solid;padding-left:1em;margin-left:0}hr{margin:2em 0}@media print{@page{margin:18mm}body{padding:0}h1,h2,h3{break-after:avoid}}`;
}
const fontCache = new Map();
export async function fontData(file) {
  if (!fontCache.has(file))
    fontCache.set(
      file,
      (async () => {
        const response = await fetch(
          new URL(`../assets/fonts/${file}.ttf`, import.meta.url),
        );
        if (!response.ok)
          throw new Error(
            "The reading font could not be loaded. Please reload and try again.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      })().catch((error) => {
        fontCache.delete(file);
        throw error;
      }),
    );
  return fontCache.get(file);
}
export async function htmlDownload(html, settings, title, xhtml = false) {
  const file = FONTS[settings.font].file;
  const regular = ["OpenDyslexic", "AtkinsonHyperlegible"].includes(file)
    ? `${file}-Regular`
    : file;
  const [normal, bold] = await Promise.all([
    fontData(regular),
    fontData(`${file}-Bold`),
  ]);
  const fontCSS = `@font-face{font-family:ExportFont;src:url(data:font/ttf;base64,${normal}) format('truetype');font-weight:400}@font-face{font-family:ExportFont;src:url(data:font/ttf;base64,${bold}) format('truetype');font-weight:700}`;
  const root = readingRoot(html, settings);
  if (xhtml) {
    const xml = document.implementation.createDocument(
      "http://www.w3.org/1999/xhtml",
      "html",
    );
    const head = xml.createElementNS(xml.documentElement.namespaceURI, "head");
    const body = xml.createElementNS(xml.documentElement.namespaceURI, "body");
    const titleNode = xml.createElementNS(
      xml.documentElement.namespaceURI,
      "title",
    );
    titleNode.textContent = title;
    const style = xml.createElementNS(
      xml.documentElement.namespaceURI,
      "style",
    );
    style.textContent =
      fontCSS + readingCSS(settings, "ExportFont, sans-serif");
    head.append(titleNode, style);
    body.append(xml.importNode(root, true));
    xml.documentElement.append(head, body);
    return new Blob([new XMLSerializer().serializeToString(xml)], {
      type: "application/xhtml+xml",
    });
  }
  return new Blob(
    [
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>${fontCSS}${readingCSS(settings, "ExportFont, sans-serif")}</style></head><body>${root.outerHTML}</body></html>`,
    ],
    { type: "text/html;charset=utf-8" },
  );
}
