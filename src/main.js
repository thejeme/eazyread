import {
  DEFAULTS,
  FONTS,
  normalizeSettings,
  plainHTML,
  readingRoot,
  readableText,
} from "./reading.js";
import {
  importFile,
  exportChoices,
  exportDocument,
  MAX_SIZE,
} from "./formats.js";

const $ = (id) => document.getElementById(id);
let settings;
try {
  settings = normalizeSettings(
    JSON.parse(localStorage.getItem("eazyread-settings") || "{}"),
  );
} catch {
  settings = { ...DEFAULTS };
}
let current = null,
  busy = false,
  statusTimer;
const controls = {
  font: "font-select",
  size: "font-size",
  spacing: "letter-spacing",
  line: "line-height",
  focus: "bolding-select",
  width: "reading-width",
};
function status(message, persist = false) {
  clearTimeout(statusTimer);
  $("status").textContent = message;
  $("status").hidden = false;
  if (!persist)
    statusTimer = setTimeout(() => ($("status").hidden = true), 3500);
}
function clearStatus() {
  clearTimeout(statusTimer);
  $("status").hidden = true;
}
function error(message) {
  clearStatus();
  $("error").textContent = message;
  $("error").hidden = false;
}
function setBusy(value) {
  busy = value;
  for (const id of [
    "generate-button",
    "sample-button",
    "file-input",
    "download-button",
    "target-button",
  ])
    $(id).disabled = value;
  $("target").setAttribute("aria-busy", String(value));
  $("generate").setAttribute("aria-busy", String(value));
}
function applySettings(render = true) {
  document.body.dataset.theme = settings.theme;
  const style = document.documentElement.style;
  style.setProperty("--reader-font", FONTS[settings.font].css);
  style.setProperty("--reader-size", `${settings.size}px`);
  style.setProperty("--reader-spacing", `${settings.spacing}px`);
  style.setProperty("--reader-line", settings.line);
  style.setProperty("--reader-width", `${settings.width}ch`);
  for (const [key, id] of Object.entries(controls))
    $(id).value = String(settings[key]);
  $("font-size-value").textContent = `${settings.size} px`;
  document.querySelectorAll("[data-theme]").forEach((button) => {
    if (button.tagName === "BUTTON")
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.theme === settings.theme),
      );
  });
  try {
    localStorage.setItem("eazyread-settings", JSON.stringify(settings));
  } catch {
    /* Reading works when storage is disabled. */
  }
  const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]').content = bg;
  if (render && current)
    $("target-text").replaceChildren(readingRoot(current.html, settings));
}
for (const [key, id] of Object.entries(controls))
  $(id).addEventListener(key === "size" ? "input" : "change", (event) => {
    settings[key] =
      key === "font" ? event.target.value : Number(event.target.value);
    applySettings(key === "focus");
  });
document.querySelectorAll(".theme-options button").forEach((button) =>
  button.addEventListener("click", () => {
    settings.theme = button.dataset.theme;
    applySettings(false);
  }),
);
$("reset-settings").addEventListener("click", () => {
  settings = { ...DEFAULTS };
  applySettings();
});
function updateCount() {
  const words = $("textarea").value.trim().match(/\S+/gu)?.length || 0;
  $("input-count").textContent = words
    ? `${words.toLocaleString()} word${words === 1 ? "" : "s"} · ready when you are`
    : "Or open a document below";
}
$("textarea").addEventListener("input", updateCount);
function showDocument(doc) {
  current = doc;
  $("generate").hidden = true;
  $("target").hidden = false;
  $("error").hidden = true;
  $("document-title").textContent = doc.name;
  const root = readingRoot(doc.html, settings);
  $("target-text").replaceChildren(root);
  const words = readableText(root).match(/\S+/gu)?.length || 0;
  $("document-meta").textContent =
    `${doc.ext.toUpperCase()} · ${words.toLocaleString()} words · about ${Math.max(1, Math.ceil(words / 220))} min read`;
  $("export-format").replaceChildren(
    ...exportChoices(doc).map((item) => new Option(item.label, item.value)),
  );
  $("document-notice").textContent = doc.notice || "";
  $("document-notice").hidden = !doc.notice;
  updateFormatNote();
  window.scrollTo({ top: 0 });
  $("target-text").focus({ preventScroll: true });
}
function updateFormatNote() {
  const format = $("export-format").value;
  $("format-note").textContent =
    format === "pdf"
      ? "A new PDF with selectable text, your font, and reading styles. Text is reflowed."
      : format === "html" || format === "htm" || format === "xhtml"
        ? "A self-contained reading edition, with fonts included."
        : ["docx", "epub", "odt", "rtf"].includes(format)
          ? `A new .${format} reading edition. Your original file stays untouched.`
          : "Original text and syntax. Choose HTML or PDF to include reading styles.";
}
$("export-format").addEventListener("change", updateFormatNote);
$("generate-button").addEventListener("click", () => {
  if (busy) return;
  const text = $("textarea").value;
  if (!text.trim()) {
    $("textarea").focus();
    error("Add some text or choose a file to get started.");
    return;
  }
  if (text.length > 1500000) {
    error("Please use fewer than 1.5 million characters at a time.");
    return;
  }
  showDocument({
    name: "Your reading space",
    ext: "html",
    html: plainHTML(text),
    buffer: new TextEncoder().encode(text).buffer,
  });
});
$("textarea").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter")
    $("generate-button").click();
});
$("sample-button").addEventListener("click", () => {
  $("textarea").value =
    "A little space to think\n\nReading doesn’t have to be a race. Sometimes, all it takes is a quieter page, a comfortable font, and a little room between the lines.\n\nEazyRead gently highlights the beginning of each word, giving your eyes a place to land as you move through a sentence. Some people find this more comfortable. Try it, adjust it, and see what works for you.\n\nBring a chapter you’ve been meaning to finish, notes from a busy day, or an article that deserves your attention. Choose a warm background for the evening, a bookish serif for a long story, or simply stay with the familiar.\n\nThere is no perfect pace. There is only yours.";
  updateCount();
  $("generate-button").click();
});
$("target-button").addEventListener("click", () => {
  $("target").hidden = true;
  $("generate").hidden = false;
  $("error").hidden = true;
  current = null;
  $("textarea").focus();
});
$("settings-button").addEventListener("click", () => {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("settings-button").setAttribute("aria-expanded", String(open));
});
async function openFile(file) {
  if (busy || !file) return;
  $("error").hidden = true;
  if (file.size > MAX_SIZE) {
    error("This file is larger than 25 MB. Please choose a smaller document.");
    return;
  }
  setBusy(true);
  status("Opening your document…", true);
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const doc = await importFile(file, (message) => status(message, true));
    showDocument(doc);
    clearStatus();
  } catch (e) {
    console.error(e);
    error(
      e.message ||
        "This document could not be opened. It may be damaged or unsupported.",
    );
  } finally {
    setBusy(false);
    $("file-input").value = "";
  }
}
$("file-input").addEventListener("change", (event) =>
  openFile(event.target.files[0]),
);
let dragDepth = 0;
$("dropzone").addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth++;
  $("dropzone").classList.add("dragover");
});
$("dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
$("dropzone").addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $("dropzone").classList.remove("dragover");
  }
});
$("dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  $("dropzone").classList.remove("dragover");
  if (event.dataTransfer.files.length > 1) {
    error("Choose one file at a time.");
    return;
  }
  openFile(event.dataTransfer.files[0]);
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
$("download-button").addEventListener("click", async () => {
  if (busy || !current) return;
  const doc = current,
    preferences = { ...settings },
    format = $("export-format").value;
  $("error").hidden = true;
  setBusy(true);
  status("Preparing your reading edition…", true);
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const blob = await exportDocument(doc, preferences, format, (message) =>
      status(message, true),
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    const base =
      doc.name === "Your reading space"
        ? "reading"
        : doc.name.replace(/\.[^.]+$/, "");
    a.href = url;
    a.download = `${base}-eazyread.${format}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status("Your download is ready.");
  } catch (e) {
    console.error(e);
    error(
      e.message ||
        "The download could not be created. Please try another format.",
    );
  } finally {
    setBusy(false);
  }
});
$("print-button").addEventListener("click", async () => {
  await document.fonts.ready;
  window.print();
});
applySettings(false);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* Offline support is optional. */
    });
  });
