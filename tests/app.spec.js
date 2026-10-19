import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { readFile } from "node:fs/promises";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const sentence = "Reading becomes easier with a little room.";
async function upload(
  page,
  name,
  buffer,
  mimeType = "application/octet-stream",
) {
  await page
    .locator("#file-input")
    .setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
}
async function download(page, format) {
  if (format) await page.locator("#export-format").selectOption(format);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: false }).click();
  const file = await pending;
  return {
    name: file.suggestedFilename(),
    bytes: await readFile(await file.path()),
  };
}
function docx() {
  const z = new JSZip();
  z.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  z.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  z.file(
    "word/document.xml",
    `<w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter one</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">${sentence} Café Ελληνικά Привет </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Emphasis stays.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A table cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`,
  );
  z.file("word/media/image.png", Buffer.from("preserved image data"));
  return z.generateAsync({ type: "nodebuffer" });
}
function epub() {
  const z = new JSZip();
  z.file("mimetype", "application/epub+zip", { compression: "STORE" });
  z.file(
    "META-INF/container.xml",
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
  );
  z.file(
    "OPS/book.opf",
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
  );
  for (const name of ["one", "two"])
    z.file(
      `OPS/${name}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${name}</title></head><body><h1>Chapter ${name}</h1><p>${sentence}</p><a href="two.xhtml">Link</a></body></html>`,
    );
  z.file("OPS/picture.png", "original picture");
  return z.generateAsync({ type: "nodebuffer" });
}
function odt() {
  const z = new JSZip();
  z.file("mimetype", "application/vnd.oasis.opendocument.text", {
    compression: "STORE",
  });
  z.file(
    "content.xml",
    `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:automatic-styles/><office:body><office:text><text:h text:outline-level="1">Chapter one</text:h><text:p>${sentence}<text:s text:c="3"/>Indented<text:line-break/>A new line</text:p></office:text></office:body></office:document-content>`,
  );
  z.file("Pictures/picture.png", "original picture");
  return z.generateAsync({ type: "nodebuffer" });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("literal pasted text, whitespace, settings, storage and reset", async ({
  page,
}) => {
  await page.screenshot({
    path: "test-results/desktop-input.png",
    fullPage: true,
  });
  const text =
    "Hello <script>alert(1)</script> & friends.\nA second line.\n\nCafé Ελληνικά Привет 👋";
  await page.locator("#textarea").fill(text);
  await page.getByRole("button", { name: "Make it easier" }).click();
  await expect(page.locator("#target-text")).toContainText(
    "<script>alert(1)</script> & friends.",
  );
  await expect(page.locator("#target-text script")).toHaveCount(0);
  await expect(page.locator("#target-text p")).toHaveCount(2);
  await expect(page.locator(".word-focus").first()).toHaveText("He");
  await page.locator("#settings-button").click();
  await page.locator("#bolding-select").selectOption("0");
  await expect(page.locator(".word-focus")).toHaveCount(0);
  await page.locator("#font-select").selectOption("dyslexic");
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "night");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "night");
  await page.locator("#sample-button").click();
  await page.locator("#settings-button").click();
  await expect(page.locator("#font-select")).toHaveValue("dyslexic");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "paper");
  await expect(page.locator("#font-select")).toHaveValue("sans");
});
test("HTML is safe, structured and exported with embedded fonts", async ({
  page,
}) => {
  let external = 0;
  await page.route("https://evil.invalid/**", (route) => {
    external++;
    return route.abort();
  });
  await upload(
    page,
    "article.htm",
    '<h1>A useful heading</h1><p>Hello <em>reader</em> &amp; friends.</p><img src="https://evil.invalid/pixel" onerror="alert(1)"><script>alert(1)</script><iframe src="https://evil.invalid"></iframe><a href="javascript:alert(1)">bad</a><a href="https://example.com">safe</a><pre>code stays unchanged</pre>',
  );
  await expect(page.locator("#target")).toBeVisible();
  await expect(page.locator("#target-text h1")).toHaveText("A useful heading");
  await expect(
    page.locator("#target-text script,#target-text iframe,#target-text img"),
  ).toHaveCount(0);
  expect(external).toBe(0);
  await expect(page.locator("#target-text pre .word-focus")).toHaveCount(0);
  await expect(page.locator("#target-text a").last()).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  const out = await download(page);
  expect(out.name).toBe("article-eazyread.htm");
  expect(out.bytes.toString()).toContain("data:font/ttf;base64,");
  expect(out.bytes.toString()).toContain("word-focus");
  expect(out.bytes.toString()).not.toContain("evil.invalid");
});
test("DOCX round trip preserves XML text, table, media and applies styles", async ({
  page,
}) => {
  await upload(page, "notes.docx", await docx());
  await expect(page.locator("#target-text h1")).toHaveText("Chapter one");
  await expect(page.locator("#target-text td")).toHaveText("A table cell");
  const out = await download(page);
  expect(out.name).toBe("notes-eazyread.docx");
  const z = await JSZip.loadAsync(out.bytes);
  expect(await z.file("word/media/image.png").async("string")).toBe(
    "preserved image data",
  );
  const xml = await z.file("word/document.xml").async("string");
  expect(xml).toContain("w:b");
  expect(xml).toContain("w:rFonts");
  const text = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return {
      error: !!doc.querySelector("parsererror"),
      text: [...doc.getElementsByTagNameNS("*", "t")]
        .map((x) => x.textContent)
        .join(""),
    };
  }, xml);
  expect(text.error).toBe(false);
  expect(text.text).toContain(
    sentence + " Café Ελληνικά Привет Emphasis stays.",
  );
  await page.locator("#target-button").click();
  await upload(page, "roundtrip.docx", out.bytes);
  await expect(page.locator("#target-text")).toContainText(sentence);
});
test("EPUB uses spine order and retains chapters and assets in its export", async ({
  page,
}) => {
  await upload(page, "book.epub", await epub());
  await expect(page.locator("#target-text h1").first()).toHaveText(
    "Chapter one",
  );
  const out = await download(page);
  expect(out.name).toBe("book-eazyread.epub");
  const z = await JSZip.loadAsync(out.bytes);
  expect(await z.file("mimetype").async("string")).toBe("application/epub+zip");
  expect(await z.file("OPS/picture.png").async("string")).toBe(
    "original picture",
  );
  const chapter = await z.file("OPS/one.xhtml").async("string");
  expect(chapter).toContain("word-focus");
  const valid = await page.evaluate(
    (xml) =>
      !new DOMParser()
        .parseFromString(xml, "application/xml")
        .querySelector("parsererror"),
    chapter,
  );
  expect(valid).toBe(true);
  // First local ZIP header: mimetype, uncompressed, no extra field.
  expect(out.bytes.readUInt16LE(8)).toBe(0);
  expect(out.bytes.subarray(30, 38).toString()).toBe("mimetype");
  await page.locator("#target-button").click();
  await upload(page, "roundtrip.epub", out.bytes);
  await expect(page.locator("#target-text")).toContainText(sentence);
});
test("ODT keeps whitespace, media and named text styles", async ({ page }) => {
  await upload(page, "notes.odt", await odt());
  await expect(page.locator("#target-text h1")).toHaveText("Chapter one");
  await expect(page.locator("#target-text")).toContainText("Indented");
  const out = await download(page);
  const z = await JSZip.loadAsync(out.bytes);
  const xml = await z.file("content.xml").async("string");
  expect(xml).toContain('fo:font-weight="bold"');
  expect(xml).toContain("text:span");
  expect(await z.file("Pictures/picture.png").async("string")).toBe(
    "original picture",
  );
  expect(
    await page.evaluate(
      (xml) =>
        !new DOMParser()
          .parseFromString(xml, "application/xml")
          .querySelector("parsererror"),
      xml,
    ),
  ).toBe(true);
  await page.locator("#target-button").click();
  await upload(page, "roundtrip.odt", out.bytes);
  await expect(page.locator("#target-text")).toContainText(sentence);
});
test("RTF reads nested formatting, escapes and Unicode and round trips text", async ({
  page,
}) => {
  await upload(
    page,
    "story.rtf",
    String.raw`{\rtf1\ansi\uc1{\fonttbl{\f0 Hidden font;}}Hello {\b bold} and {\i italic}.\par Caf\'e9 \u937? \u-10179?\u-8704? \{braces\}\\end}`,
  );
  await expect(page.locator("#target-text")).toContainText(
    "Hello bold and italic.",
  );
  await expect(page.locator("#target-text")).toContainText(
    "Café Ω 😀 {braces}\\end",
  );
  await expect(page.locator("#target-text")).not.toContainText("Hidden font");
  const out = await download(page);
  expect(out.bytes.toString()).toContain("\\u937?");
  await page.locator("#target-button").click();
  await upload(page, "roundtrip.rtf", out.bytes);
  await expect(page.locator("#target-text")).toContainText(
    "Café Ω 😀 {braces}\\end",
  );
});
for (const [extension, text] of [
  ["txt", "  Hello\n\n  world & <literal>"],
  ["md", "# Heading\n\nA **bold** thought.\n\n```js\nconst safe = true;\n```"],
  ["csv", 'Name,Note\r\n"A, B","a ""quote""\nand newline"'],
  ["tsv", "Name\tNote\nAda\tHello"],
  ["json", '{"value": "Hello & <world>"}'],
  ["xml", '<?xml version="1.0"?><root>Hello</root>'],
  ["yaml", "title: Hello\nvalue: 42"],
  ["srt", "1\n00:00:01,000 --> 00:00:02,000\nHello reader"],
  ["vtt", "WEBVTT\n\n00:01.000 --> 00:02.000\nHello reader"],
  ["log", "2026-10-19 Hello"],
  ["tex", "\\section{Hello}"],
  ["yml", "hello: world"],
  ["text", "Hello reader"],
  ["markdown", "# Hello reader"],
]) {
  test(`${extension} imports and keeps exact original bytes on download`, async ({
    page,
  }) => {
    const buffer = Buffer.from(text);
    await upload(page, `sample.${extension}`, buffer);
    await expect(page.locator("#target")).toBeVisible();
    const out = await download(page);
    expect(out.name).toBe(`sample-eazyread.${extension}`);
    expect(out.bytes.equals(buffer)).toBe(true);
    if (extension === "csv") {
      await expect(page.locator("#target-text tr")).toHaveCount(2);
      await expect(
        page.locator("#target-text tr").last().locator("td").first(),
      ).toHaveText("A, B");
    }
    if (extension === "md") {
      await expect(page.locator("#target-text h1")).toHaveText("Heading");
      await expect(page.locator("#target-text code .word-focus")).toHaveCount(
        0,
      );
    }
  });
}
test("PDF stays PDF, wraps across pages, preserves selectable Unicode and can reopen", async ({
  page,
}) => {
  const input = new jsPDF();
  input.text("First page of a useful document.", 20, 20);
  input.addPage();
  input.text(sentence, 20, 20);
  await upload(page, "report.pdf", input.output("arraybuffer"));
  await expect(page.locator("#target")).toBeVisible();
  await expect(page.locator("#target-text")).toContainText(sentence);
  await expect(page.locator("#export-format")).toHaveValue("pdf");
  const out = await download(page);
  expect(out.name).toBe("report-eazyread.pdf");
  expect(out.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await page.locator("#target-button").click();
  await upload(page, "roundtrip.pdf", out.bytes);
  await expect(page.locator("#target-text")).toContainText(
    "First page of a useful document.",
  );
  await expect(page.locator("#target-text")).toContainText(sentence);
});
test("long PDF has multiple pages and Unicode is selectable", async ({
  page,
}) => {
  const text = "Café Ελληνικά Привет — Reading is comfortable.\n\n".repeat(120);
  await page.locator("#textarea").fill(text);
  await page.locator("#generate-button").click();
  const out = await download(page, "pdf");
  await page.locator("#target-button").click();
  await upload(page, "unicode.pdf", out.bytes);
  await expect(page.locator("#target")).toBeVisible();
  await expect(page.locator("#target-text")).toContainText(
    "Café Ελληνικά Привет",
  );
  expect(await page.locator("#target-text hr").count()).toBeGreaterThan(2);
});
test("clear errors for empty, unknown, corrupt, scanned and oversized files; can recover", async ({
  page,
}) => {
  for (const [name, buffer, message] of [
    ["empty.txt", Buffer.alloc(0), "empty"],
    ["old.doc", Buffer.from("binary"), "not supported"],
    ["bad.docx", Buffer.from("not a zip"), "zip"],
    ["bad.pdf", Buffer.from("broken PDF"), "PDF"],
  ]) {
    await upload(page, name, buffer);
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#generate")).toBeVisible();
  }
  await upload(page, "huge.txt", Buffer.alloc(25 * 1024 * 1024 + 1));
  await expect(page.locator("#error")).toContainText("25 MB");
  const scan = new jsPDF();
  scan.rect(20, 20, 60, 60, "F");
  await upload(page, "scan.pdf", scan.output("arraybuffer"));
  await expect(page.locator("#error")).toContainText("OCR");
  await upload(page, "fine.txt", "You can still read.");
  await expect(page.locator("#target-text")).toHaveText("You can still read.");
});
test("UTF-16 input is decoded while original download encoding is preserved", async ({
  page,
}) => {
  const bytes = Buffer.concat([
    Buffer.from([255, 254]),
    Buffer.from("Café — Ελληνικά", "utf16le"),
  ]);
  await upload(page, "utf16.txt", bytes);
  await expect(page.locator("#target-text")).toHaveText("Café — Ελληνικά");
  const out = await download(page);
  expect(out.bytes.equals(bytes)).toBe(true);
});
test("small-screen layout stays within viewport and keyboard controls work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("#sample-button").click();
  await page.locator("#settings-button").click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "sepia");
  await page.screenshot({
    path: "test-results/mobile-reader.png",
    fullPage: true,
  });
});

test("XHTML output remains valid XML and reopens", async ({ page }) => {
  await upload(
    page,
    "article.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Article</title></head><body><h1>Hello</h1><p>One &amp; two<br/>Another line.</p></body></html>',
  );
  await expect(page.locator("#target")).toBeVisible();
  const out = await download(page);
  expect(out.name).toBe("article-eazyread.xhtml");
  expect(
    await page.evaluate(
      (xml) =>
        !new DOMParser()
          .parseFromString(xml, "application/xml")
          .querySelector("parsererror"),
      out.bytes.toString(),
    ),
  ).toBe(true);
  await page.locator("#target-button").click();
  await upload(page, "again.xhtml", out.bytes);
  await expect(page.locator("#target")).toBeVisible();
  await expect(page.locator("#target-text")).toContainText("One & two");
});
for (const font of ["serif", "humanist", "mono", "dyslexic"])
  test(`PDF embeds the ${font} font and remains readable`, async ({ page }) => {
    await page
      .locator("#textarea")
      .fill("An easier reading experience. Café, naïve, résumé.");
    await page.locator("#generate-button").click();
    await page.locator("#settings-button").click();
    await page.locator("#font-select").selectOption(font);
    const out = await download(page, "pdf");
    expect(out.bytes.toString("latin1")).toContain("/FontFile2");
    await page.locator("#target-button").click();
    await upload(page, `${font}.pdf`, out.bytes);
    await expect(page.locator("#target")).toBeVisible();
    await expect(page.locator("#target-text")).toContainText(
      "An easier reading experience. Café, naïve, résumé.",
    );
  });
test("PDF wraps whole focused words without changing text", async ({
  page,
}) => {
  const words =
    "Reading comfortable considerations understanding typography variations improve concentration repeatedly".split(
      " ",
    );
  const text = Array.from({ length: 12 }, () => words.join(" ")).join(" ");
  await page.locator("#textarea").fill(text);
  await page.locator("#generate-button").click();
  await page.locator("#settings-button").click();
  await page.locator("#reading-width").selectOption("56");
  await page.locator("#font-size").fill("30");
  await page.locator("#font-size").dispatchEvent("input");
  const out = await download(page, "pdf");
  await page.locator("#target-button").click();
  await upload(page, "wrapped.pdf", out.bytes);
  await expect(page.locator("#target")).toBeVisible();
  const actual = await page.locator("#target-text").innerText();
  expect(actual.replace(/\s+/g, " ").trim()).toBe(text);
});
test("unsupported PDF characters show a useful error and allow HTML download", async ({
  page,
}) => {
  await page.locator("#textarea").fill("Hello 👋 你好");
  await page.locator("#generate-button").click();
  await page.locator("#export-format").selectOption("pdf");
  await page.locator("#download-button").click();
  await expect(page.locator("#error")).toContainText("HTML");
  const out = await download(page, "html");
  expect(out.bytes.toString()).toContain("👋");
  expect(
    await page.evaluate(
      (html) =>
        new DOMParser().parseFromString(html, "text/html").body.textContent,
      out.bytes.toString(),
    ),
  ).toContain("你好");
});
test("malformed saved preferences cannot break startup", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("eazyread-settings", "null"));
  await page.reload();
  await page.locator("#sample-button").click();
  await expect(page.locator("#target")).toBeVisible();
});
test.describe("offline and static hosting", () => {
  test.use({ serviceWorkers: "allow" });
  test("subdirectory deployment works offline, including lazy PDF conversion", async ({
    page,
    context,
  }) => {
    await page.goto("http://127.0.0.1:4288/eazyread/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true },
          ),
        );
    });
    await context.setOffline(true);
    await page.reload();
    await page.locator("#sample-button").click();
    await expect(page.locator("#target")).toBeVisible();
    const out = await download(page, "pdf");
    expect(out.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await page.locator("#target-button").click();
    await upload(page, "offline.pdf", out.bytes);
    await expect(page.locator("#target")).toBeVisible();
    await expect(page.locator("#target-text")).toContainText(
      "A little space to think",
    );
    const cacheKeys = await page.evaluate(async () => {
      const keys = await caches.keys();
      return Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      );
    });
    expect(cacheKeys.flat().some((url) => url.includes("offline.pdf"))).toBe(
      false,
    );
  });
});
