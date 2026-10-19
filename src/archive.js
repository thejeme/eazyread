import JSZip from "jszip";
import {
  applyFocus,
  focusParts,
  escapeHTML,
  FONTS,
  THEMES,
  readingCSS,
  fontData,
} from "./reading.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const FO = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
export function parseXML(source) {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("The document contains invalid XML and could not be read.");
  return doc;
}
const serialize = (doc) => new XMLSerializer().serializeToString(doc);
const elements = (root, ns, name) => [...root.getElementsByTagNameNS(ns, name)];
export async function openArchive(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files);
  const size = files.reduce(
    (sum, file) => sum + (file._data?.uncompressedSize || 0),
    0,
  );
  if (files.length > 5000 || size > 120 * 1024 * 1024)
    throw new Error(
      "This document expands to more than the 120 MB / 5,000 entry limit. Please use a smaller file.",
    );
  return zip;
}
async function xmlFile(zip, path) {
  const file = zip.file(path);
  if (!file)
    throw new Error(
      `This document is missing ${path}. It may be damaged or password-protected.`,
    );
  return parseXML(await file.async("string"));
}
export async function readDOCX(zip) {
  const doc = await xmlFile(zip, "word/document.xml");
  const body = elements(doc, W, "body")[0];
  if (!body) throw new Error("This Word document has no readable body.");
  function visit(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.localName;
    if (
      node.namespaceURI === W &&
      ["del", "instrText", "pPr", "rPr", "tblPr", "tcPr", "sectPr"].includes(
        tag,
      )
    )
      return "";
    if (tag === "t") return escapeHTML(node.textContent);
    if (tag === "tab") return "\t";
    if (tag === "br" || tag === "cr") return "<br>";
    if (tag === "drawing" || tag === "pict")
      return "<p>[Image retained in Word download]</p>";
    let inner = [...node.children].map(visit).join("");
    if (tag === "r") {
      const props = [...node.children].find((n) => n.localName === "rPr");
      if (props) {
        const bold = elements(props, W, "b")[0],
          italic = elements(props, W, "i")[0];
        if (
          bold &&
          !["0", "false", "off"].includes(bold.getAttributeNS(W, "val"))
        )
          inner = `<strong>${inner}</strong>`;
        if (
          italic &&
          !["0", "false", "off"].includes(italic.getAttributeNS(W, "val"))
        )
          inner = `<em>${inner}</em>`;
      }
    }
    if (tag === "p") {
      const style =
        elements(node, W, "pStyle")[0]?.getAttributeNS(W, "val") || "";
      const heading = /heading\s*([1-6])/i.exec(style);
      const list = elements(node, W, "numPr").length ? "• " : "";
      const name = heading ? `h${heading[1]}` : "p";
      return `<${name}>${list}${inner}</${name}>`;
    }
    if (tag === "tbl") return `<table><tbody>${inner}</tbody></table>`;
    if (tag === "tr") return `<tr>${inner}</tr>`;
    if (tag === "tc") return `<td>${inner}</td>`;
    return inner;
  }
  return visit(body);
}
// Keep new properties in the standard WordprocessingML order, including paragraph
// shading before spacing, so strict office readers can consume the package.
const WORD_PROPERTY_ORDER = {
  rPr: "rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange".split(
    " ",
  ),
  pPr: "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange".split(
    " ",
  ),
};
function setWordProp(doc, props, tag, attributes) {
  let el = [...props.children].find(
    (child) => child.namespaceURI === W && child.localName === tag,
  );
  if (!el) {
    el = doc.createElementNS(W, `w:${tag}`);
    const order = WORD_PROPERTY_ORDER[props.localName] || [];
    const rank = (name) => {
      const index = order.indexOf(name);
      return index === -1 ? Infinity : index;
    };
    const next = [...props.children].find(
      (child) => child.namespaceURI === W && rank(child.localName) > rank(tag),
    );
    props.insertBefore(el, next || null);
  }
  for (const [name, value] of Object.entries(attributes))
    el.setAttributeNS(W, `w:${name}`, String(value));
}
export async function writeDOCX(buffer, settings) {
  const zip = await openArchive(buffer);
  // Text in headers, footers, endnotes, and footnotes receives the same treatment.
  const paths = Object.keys(zip.files).filter((path) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path),
  );
  for (const path of paths) {
    const doc = await xmlFile(zip, path);
    for (const run of elements(doc, W, "r")) {
      if (!elements(run, W, "t").length || run.closest("del")) continue;
      let props = [...run.children].find((n) => n.localName === "rPr");
      if (!props) {
        props = doc.createElementNS(W, "w:rPr");
        run.prepend(props);
      }
      setWordProp(doc, props, "rFonts", {
        ascii: FONTS[settings.font].name,
        hAnsi: FONTS[settings.font].name,
        cs: FONTS[settings.font].name,
      });
      setWordProp(doc, props, "sz", { val: Math.round(settings.size * 1.5) });
      setWordProp(doc, props, "spacing", {
        val: Math.round(settings.spacing * 15),
      });
      setWordProp(doc, props, "color", {
        val: THEMES[settings.theme].ink.slice(1),
      });
      const wasBold = elements(props, W, "b")[0];
      const keepBold =
        wasBold &&
        !["0", "false", "off"].includes(wasBold.getAttributeNS(W, "val"));
      const fragment = doc.createDocumentFragment();
      for (const child of [...run.childNodes]) {
        if (child === props) continue;
        const parts =
          child.nodeType === Node.ELEMENT_NODE && child.localName === "t"
            ? focusParts(child.textContent, settings.focus)
            : [{ node: child }];
        for (const part of parts) {
          const next = run.cloneNode(false);
          const newProps = props.cloneNode(true);
          if (part.bold && !keepBold)
            setWordProp(doc, newProps, "b", { val: 1 });
          next.append(newProps);
          if (part.node) next.append(part.node.cloneNode(true));
          else {
            const t = doc.createElementNS(W, "w:t");
            t.setAttributeNS(
              "http://www.w3.org/XML/1998/namespace",
              "xml:space",
              "preserve",
            );
            t.textContent = part.text;
            next.append(t);
          }
          fragment.append(next);
        }
      }
      run.replaceWith(fragment);
    }
    for (const p of elements(doc, W, "p")) {
      let props = [...p.children].find((n) => n.localName === "pPr");
      if (!props) {
        props = doc.createElementNS(W, "w:pPr");
        p.prepend(props);
      }
      setWordProp(doc, props, "spacing", {
        line: Math.round(settings.line * 240),
        lineRule: "auto",
      });
      setWordProp(doc, props, "shd", {
        fill: THEMES[settings.theme].bg.slice(1),
        val: "clear",
      });
    }
    zip.file(path, serialize(doc));
  }
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
function resolvePath(base, relative) {
  const url = new URL(relative, `https://document.invalid/${base}`);
  if (url.origin !== "https://document.invalid")
    throw new Error("This ebook refers to an external document.");
  return decodeURIComponent(url.pathname.slice(1));
}
export async function epubChapters(zip) {
  const container = await xmlFile(zip, "META-INF/container.xml");
  const rootPath = container
    .getElementsByTagNameNS("*", "rootfile")[0]
    ?.getAttribute("full-path");
  if (!rootPath) throw new Error("This EPUB has no package document.");
  const opf = await xmlFile(zip, rootPath);
  const manifest = new Map(
    [...opf.getElementsByTagNameNS("*", "item")].map((item) => [
      item.getAttribute("id"),
      item,
    ]),
  );
  const refs = [...opf.getElementsByTagNameNS("*", "itemref")];
  const paths = refs
    .filter((ref) => ref.getAttribute("linear") !== "no")
    .map((ref) => manifest.get(ref.getAttribute("idref")))
    .filter(
      (item) =>
        item &&
        ["application/xhtml+xml", "text/html"].includes(
          item.getAttribute("media-type"),
        ),
    )
    .map((item) => resolvePath(rootPath, item.getAttribute("href")));
  if (!paths.length) throw new Error("This EPUB has no readable chapters.");
  const allPaths = [...manifest.values()]
    .filter((item) =>
      ["application/xhtml+xml", "text/html"].includes(
        item.getAttribute("media-type"),
      ),
    )
    .map((item) => resolvePath(rootPath, item.getAttribute("href")));
  return { paths, allPaths, rootPath, opf };
}
export async function readEPUB(zip) {
  const { paths } = await epubChapters(zip);
  const chapters = [];
  for (const path of paths) {
    const doc = await xmlFile(zip, path);
    const body = doc.getElementsByTagNameNS("*", "body")[0];
    if (body) chapters.push(`<section>${body.innerHTML}</section>`);
  }
  return chapters.join("<hr>");
}
export async function writeEPUB(buffer, settings) {
  const zip = await openArchive(buffer);
  const { allPaths, rootPath, opf } = await epubChapters(zip);
  const file = FONTS[settings.font].file,
    regular = ["OpenDyslexic", "AtkinsonHyperlegible"].includes(file)
      ? `${file}-Regular`
      : file;
  const [normal, bold] = await Promise.all([
    fontData(regular),
    fontData(`${file}-Bold`),
  ]);
  const folder = `EazyRead-Fonts-${Date.now().toString(36)}`;
  const base = rootPath.includes("/")
    ? rootPath.slice(0, rootPath.lastIndexOf("/") + 1)
    : "";
  const manifest = opf.getElementsByTagNameNS("*", "manifest")[0];
  if (!manifest) throw new Error("This EPUB has no manifest.");
  for (const [name, data] of [
    ["normal", normal],
    ["bold", bold],
  ]) {
    zip.file(`${base}${folder}/${name}.ttf`, data, { base64: true });
    const item = opf.createElementNS(opf.documentElement.namespaceURI, "item");
    item.setAttribute("id", `${folder}-${name}`);
    item.setAttribute("href", `${folder}/${name}.ttf`);
    item.setAttribute("media-type", "font/ttf");
    manifest.append(item);
  }
  zip.file(rootPath, serialize(opf));
  const relative = (from, to) => {
    const a = from.split("/");
    a.pop();
    const b = to.split("/");
    while (a.length && b.length && a[0] === b[0]) {
      a.shift();
      b.shift();
    }
    return "../".repeat(a.length) + b.join("/");
  };
  for (const path of allPaths) {
    const doc = await xmlFile(zip, path);
    const body = doc.getElementsByTagNameNS("*", "body")[0];
    const head = doc.getElementsByTagNameNS("*", "head")[0];
    if (body) applyFocus(body, settings.focus);
    if (head) {
      const style = doc.createElementNS(
        doc.documentElement.namespaceURI,
        "style",
      );
      const normalURL = relative(path, `${base}${folder}/normal.ttf`),
        boldURL = relative(path, `${base}${folder}/bold.ttf`);
      style.textContent =
        `@font-face{font-family:EazyReadFont;src:url('${normalURL}');font-weight:400}@font-face{font-family:EazyReadFont;src:url('${boldURL}');font-weight:700}` +
        readingCSS(settings, "EazyReadFont, sans-serif") +
        `\nbody{font-family:EazyReadFont,sans-serif!important;font-size:${settings.size}px!important;color:${THEMES[settings.theme].ink}!important;background:${THEMES[settings.theme].bg}!important}body *{font-family:inherit!important;letter-spacing:inherit!important;line-height:inherit!important}body p,body li{color:inherit!important;background:transparent!important}`;
      head.append(style);
    }
    zip.file(path, serialize(doc));
  }
  // EPUB requires its mimetype to be the first ZIP member, stored without compression.
  return packageWithMimetype(zip, "application/epub+zip");
}
export async function readODT(zip) {
  const doc = await xmlFile(zip, "content.xml");
  const body = elements(doc, OFFICE, "text")[0];
  if (!body) throw new Error("This OpenDocument has no text body.");
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeHTML(node.data);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.localName;
    if (["binary-data", "tracked-changes", "annotation"].includes(tag))
      return "";
    if (tag === "s")
      return " ".repeat(
        Math.min(100, Number(node.getAttributeNS(TEXT, "c") || 1)),
      );
    if (tag === "tab") return "\t";
    if (tag === "line-break") return "<br>";
    const inside = [...node.childNodes].map(visit).join("");
    if (tag === "h") {
      const level = Math.max(
        1,
        Math.min(6, Number(node.getAttributeNS(TEXT, "outline-level") || 1)),
      );
      return `<h${level}>${inside}</h${level}>`;
    }
    const tags = {
      p: "p",
      list: "ul",
      "list-item": "li",
      table: "table",
      "table-row": "tr",
      "table-cell": "td",
    };
    return tags[tag] ? `<${tags[tag]}>${inside}</${tags[tag]}>` : inside;
  }
  return visit(body);
}
export async function writeODT(buffer, settings) {
  const zip = await openArchive(buffer);
  const doc = await xmlFile(zip, "content.xml");
  const body = elements(doc, OFFICE, "text")[0];
  let automatic = elements(doc, OFFICE, "automatic-styles")[0];
  if (!body || !automatic)
    throw new Error("This OpenDocument is missing its text or styles.");
  // Names are unique so existing document styles remain intact.
  const suffix = Date.now().toString(36);
  const baseName = `EazyRead${suffix}`,
    boldName = `${baseName}Bold`;
  function style(name, bold) {
    const s = doc.createElementNS(STYLE, "style:style");
    s.setAttributeNS(STYLE, "style:name", name);
    s.setAttributeNS(STYLE, "style:family", "text");
    const props = doc.createElementNS(STYLE, "style:text-properties");
    props.setAttributeNS(FO, "fo:font-family", FONTS[settings.font].name);
    props.setAttributeNS(FO, "fo:font-size", `${settings.size * 0.75}pt`);
    props.setAttributeNS(FO, "fo:color", THEMES[settings.theme].ink);
    props.setAttributeNS(FO, "fo:background-color", THEMES[settings.theme].bg);
    props.setAttributeNS(
      FO,
      "fo:letter-spacing",
      `${settings.spacing * 0.75}pt`,
    );
    if (bold) props.setAttributeNS(FO, "fo:font-weight", "bold");
    s.append(props);
    automatic.append(s);
  }
  style(baseName, false);
  style(boldName, true);
  const paragraphStyles = new Map();
  for (const paragraph of [
    ...elements(body, TEXT, "p"),
    ...elements(body, TEXT, "h"),
  ]) {
    const parentName = paragraph.getAttributeNS(TEXT, "style-name") || "";
    if (!paragraphStyles.has(parentName)) {
      const name = `${baseName}P${paragraphStyles.size}`;
      const style = doc.createElementNS(STYLE, "style:style");
      style.setAttributeNS(STYLE, "style:name", name);
      style.setAttributeNS(STYLE, "style:family", "paragraph");
      if (parentName)
        style.setAttributeNS(STYLE, "style:parent-style-name", parentName);
      const properties = doc.createElementNS(
        STYLE,
        "style:paragraph-properties",
      );
      properties.setAttributeNS(
        FO,
        "fo:line-height",
        `${settings.line * 100}%`,
      );
      properties.setAttributeNS(
        FO,
        "fo:background-color",
        THEMES[settings.theme].bg,
      );
      style.append(properties);
      automatic.append(style);
      paragraphStyles.set(parentName, name);
    }
    paragraph.setAttributeNS(
      TEXT,
      "text:style-name",
      paragraphStyles.get(parentName),
    );
  }
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode())
    if (walker.currentNode.parentElement?.closest("p,h"))
      nodes.push(walker.currentNode);
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    for (const part of focusParts(node.data, settings.focus)) {
      const span = doc.createElementNS(TEXT, "text:span");
      span.setAttributeNS(
        TEXT,
        "text:style-name",
        part.bold ? boldName : baseName,
      );
      span.textContent = part.text;
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }
  zip.file("content.xml", serialize(doc));
  return packageWithMimetype(zip, "application/vnd.oasis.opendocument.text");
}
async function packageWithMimetype(zip, mime) {
  const output = new JSZip();
  output.file("mimetype", mime, { compression: "STORE" });
  for (const [path, file] of Object.entries(zip.files))
    if (path !== "mimetype" && !file.dir)
      output.file(path, await file.async("uint8array"), {
        compression: "DEFLATE",
      });
  return output.generateAsync({
    type: "blob",
    mimeType: mime,
    compression: "DEFLATE",
  });
}
