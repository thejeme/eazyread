import { escapeHTML } from "./reading.js";

// A text-focused RTF reader. Binary pictures, fields, objects, and metadata stay out of the preview.
export function readRTF(source) {
  if (!/^\s*{\\rtf\d/.test(source))
    throw new Error("This file is not a valid RTF document.");
  let state = { skip: false, bold: false, italic: false, uc: 1 };
  const stack = [];
  let fallback = 0;
  let result = "";
  let text = "";
  const flush = () => {
    if (!text) return;
    let value = escapeHTML(text);
    if (state.bold) value = `<strong>${value}</strong>`;
    if (state.italic) value = `<em>${value}</em>`;
    result += value;
    text = "";
  };
  const add = (value) => {
    if (fallback) {
      fallback--;
      return;
    }
    if (!state.skip) text += value;
  };
  for (let i = 0; i < source.length; ) {
    const char = source[i++];
    if (char === "{") {
      flush();
      stack.push({ ...state });
    } else if (char === "}") {
      flush();
      state = stack.pop() || state;
    } else if (char === "\\") {
      const symbol = source[i];
      if (/[\\{}]/.test(symbol || "")) {
        i++;
        add(symbol);
        continue;
      }
      if (symbol === "'") {
        const bytes = [];
        while (
          source[i] === "'" &&
          /^[\da-f]{2}$/i.test(source.slice(i + 1, i + 3))
        ) {
          bytes.push(parseInt(source.slice(i + 1, i + 3), 16));
          i += 3;
          if (source[i] === "\\" && source[i + 1] === "'") i++;
          else break;
        }
        const value = new TextDecoder("windows-1252").decode(
          new Uint8Array(bytes),
        );
        for (const c of value) add(c);
        continue;
      }
      if (symbol === "*") {
        flush();
        state.skip = true;
        i++;
        continue;
      }
      if (symbol === "~") {
        i++;
        add("\u00a0");
        continue;
      }
      if (symbol === "_") {
        i++;
        add("‑");
        continue;
      }
      if (symbol === "-") {
        i++;
        continue;
      }
      const match = /^([a-z]+)(-?\d+)? ?/i.exec(source.slice(i));
      if (!match) {
        i++;
        continue;
      }
      i += match[0].length;
      const word = match[1],
        n = match[2] === undefined ? 1 : Number(match[2]);
      if (
        [
          "fonttbl",
          "colortbl",
          "stylesheet",
          "info",
          "pict",
          "object",
          "header",
          "footer",
          "footnote",
          "annotation",
          "fldinst",
          "datastore",
          "themedata",
          "listtable",
          "listoverridetable",
          "generator",
          "filetbl",
        ].includes(word)
      ) {
        flush();
        state.skip = true;
      } else if (word === "bin") i += Math.max(0, n);
      else if (word === "uc") state.uc = Math.max(0, Math.min(n, 16));
      else if (word === "u") {
        if (!state.skip) text += String.fromCharCode(n < 0 ? n + 65536 : n);
        fallback = state.uc;
      } else if (!state.skip) {
        if (word === "par" || word === "line") {
          flush();
          result += word === "par" ? "</p><p>" : "<br>";
        } else if (word === "tab") add("\t");
        else if (word === "b" || word === "i") {
          flush();
          state[word === "b" ? "bold" : "italic"] = n !== 0;
        } else if (word === "plain") {
          flush();
          state.bold = false;
          state.italic = false;
        } else if (
          [
            "emdash",
            "endash",
            "bullet",
            "lquote",
            "rquote",
            "ldblquote",
            "rdblquote",
          ].includes(word)
        )
          add(
            {
              emdash: "—",
              endash: "–",
              bullet: "•",
              lquote: "‘",
              rquote: "’",
              ldblquote: "“",
              rdblquote: "”",
            }[word],
          );
      }
    } else if (char !== "\r" && char !== "\n") add(char);
  }
  flush();
  return `<p>${result}</p>`;
}
function rtfEscape(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i),
      char = text[i];
    if (/[\\{}]/.test(char)) result += `\\${char}`;
    else if (char === "\n") result += "\\line ";
    else if (char === "\t") result += "\\tab ";
    else if (code > 127) result += `\\u${code > 32767 ? code - 65536 : code}?`;
    else result += char;
  }
  return result;
}
export function writeRTF(root, settings, fontName) {
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) return rtfEscape(node.data);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    let body = [...node.childNodes].map(visit).join("");
    if (["b", "strong"].includes(tag)) body = `{\\b ${body}}`;
    if (["em", "i"].includes(tag)) body = `{\\i ${body}}`;
    if (/^h[1-6]$/.test(tag)) body = `{\\b ${body}}`;
    if (tag === "br") return "\\line ";
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"].includes(tag))
      body += "\\par\n";
    if (["td", "th"].includes(tag)) body += "\\tab ";
    return body;
  }
  return new Blob(
    [
      `{\\rtf1\\ansi\\deff0\\uc1{\\fonttbl{\\f0 ${rtfEscape(fontName)};}}\\f0\\fs${Math.round(settings.size * 1.5)}\\sl${Math.round(settings.size * 0.75 * settings.line * 20)}\\slmult0\\expndtw${Math.round(settings.spacing * 15)} ${visit(root)}}`,
    ],
    { type: "application/rtf" },
  );
}
