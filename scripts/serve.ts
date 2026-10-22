// A tiny static server for dist/demo on 127.0.0.1:5173 (no dependencies).

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const demo = join(root, "demo");
const PORT = 5173;
const HOST = "127.0.0.1";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  let path = "/";
  try {
    path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  } catch {
    // keep "/"
  }
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(join(demo, path));
  if (!file.startsWith(`${demo}/`) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(file));
});
server.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => console.log(`Synod player demo: http://${HOST}:${PORT}/`));
