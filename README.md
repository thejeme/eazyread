# EazyRead

A simple, private reading space. Paste text or open a document, adjust the reading style, and download a reading edition. Everything runs on your device: no server, account, uploads, analytics, or runtime CDNs.

## Supported files

| File type                                                      | Reading experience                                                    | Default download                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| PDF                                                            | Extract selectable text in page order                                 | A new PDF with real, selectable text, embedded fonts, word focus, and reflowed pages              |
| Word (`.docx`)                                                 | Paragraphs, headings, basic emphasis, lists, and tables               | DOCX, retaining document structure, images, links, headers, footnotes, and other package contents |
| EPUB                                                           | Chapters in spine order                                               | EPUB, retaining chapters, navigation, links, and images, with reading styles and embedded fonts   |
| OpenDocument (`.odt`)                                          | Headings, paragraphs, lists, tables, and whitespace                   | ODT, retaining document structure and media, with reading styles                                  |
| Rich text (`.rtf`)                                             | Text, paragraphs, basic bold/italic, escaped characters, and Unicode  | Reflowed RTF with word focus and reading settings                                                 |
| HTML (`.html`, `.htm`, `.xhtml`)                               | Safe headings, lists, links, tables, code, and embedded raster images | Same extension, self-contained with reading styles and embedded fonts                             |
| Markdown (`.md`, `.markdown`)                                  | Rendered headings, lists, links, tables, and code                     | Original bytes, preserving source syntax                                                          |
| Text (`.txt`, `.text`), subtitles (`.srt`, `.vtt`)             | Paragraphs and line breaks                                            | Original bytes, preserving text and encoding                                                      |
| Tables (`.csv`, `.tsv`)                                        | Tables, including quoted fields and multiline values                  | Original bytes, preserving valid data                                                             |
| Data/source (`.json`, `.xml`, `.yaml`, `.yml`, `.tex`, `.log`) | Literal text with formatting intact                                   | Original bytes, preserving syntax                                                                 |

All imports also offer styled HTML and PDF downloads. Plain-text/data formats cannot store fonts or word focus, so their default download preserves the original. The interface explains this before downloading. Original files are never modified.

Six atmospheres (Paper, Sepia, Sage, Rose, Night, Contrast), five fonts (DejaVu Sans, DejaVu Serif, Atkinson Hyperlegible, DejaVu Sans Mono, OpenDyslexic), adjustable word focus, text size, line height, letter spacing, and reading width. Preferences persist locally; document contents do not. Code blocks retain literal text without added word focus. Supports drag and drop, keyboard navigation, mobile screens, and printing.

### Conversion limits

- PDFs are reading editions, not page replicas. Columns follow PDF extraction order; images, forms, signatures, and annotations are not transferred. Scanned/outlined PDFs need OCR first. Password-protected PDFs are rejected.
- RTF output preserves text and basic emphasis, not original page layout, pictures, or complex tables. The RTF importer supports Windows-1252 hex escapes and Unicode controls; other legacy RTF code pages may need conversion first.
- Word/ODT previews focus on text. The archive-based downloads preserve their original media and structure. Fonts for Word, ODT, and RTF need to be installed on the recipient device; EPUB, HTML, and PDF embed fonts. Complex document layouts may reflow as text size changes.
- Imported HTML does not execute scripts, load remote images, or use document-supplied CSS. Images referenced by paths appear as placeholders in the preview; ebook/office originals retain their media in same-format downloads.
- PDF generation supports characters available in the selected embedded font. Unsupported characters, supplementary Unicode (including emoji), and complex writing systems produce a clear error. Use the browser’s **Print → Save as PDF** for browser font fallback and complex-script shaping, or download HTML.
- Legacy `.doc`, DRM-protected ebooks, encrypted office files, images, and OCR are not supported.
- Limits: 25 MB per file, 1.5 million text characters, 500 PDF input pages, 1,000 generated PDF pages, 120 MB expanded archives / 5,000 archive entries, and 10,000 table rows / 200 columns.

## Run and develop

The checked-in `index.html`, `style.css`, `sw.js`, and `assets/` deploy directly to static hosting, including GitHub Pages under a subdirectory. No build step is required to host the committed app. Serve over HTTP(S), not `file://`.

Development requires **Node 22.13+ (Node 24 recommended)**:

```sh
npm ci
npm start
# http://127.0.0.1:4287
```

Edit `src/`, `index.html`, or `style.css`, then rebuild before serving or deploying:

```sh
npm run build
```

The build bundles pinned dependencies, copies PDF worker resources, and generates a content-versioned offline asset list. Commit the rebuilt `assets/` along with source changes. After the first complete load, the service worker caches the app, conversion code, and fonts for offline use. Imported files and generated downloads are never put in that cache. A new release gets its own cache and activates after existing EazyRead tabs close, so HTML, code, and PDF workers stay together.

## Verification

```sh
npx playwright install --with-deps chromium
npm run check
npm audit
```

Browser tests cover literal pasted text/XSS, remote-image isolation, settings persistence, responsive layout, original-byte text/data downloads, office/ebook archive round trips, RTF escapes, PDF text/Unicode/pagination, invalid/scanned/oversized inputs, offline operation, and deployment under a subdirectory.

Font licenses and attribution are in `assets/fonts/`. Bundled dependency licenses accompany the generated assets and PDF resources.
