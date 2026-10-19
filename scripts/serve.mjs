import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(".");
const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");
const port = Number(process.env.PORT) || 4287;
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".bcmap": "application/octet-stream",
  ".wasm": "application/wasm",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (basePath && !pathname.startsWith(basePath + "/"))
      throw new Error("Not found");
    let path = resolve(root, "." + pathname.slice(basePath.length));
    if (path !== root && !path.startsWith(root + sep))
      throw new Error("Forbidden");
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    const content = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`EazyRead: http://127.0.0.1:${port}${basePath}/`),
);
