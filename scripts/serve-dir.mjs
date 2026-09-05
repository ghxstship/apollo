#!/usr/bin/env node
/* Serve one directory of static files on a port: node scripts/serve-dir.mjs <dir> <port>.
   For looking at snapshots the demo walk kept; nothing more. */
import { createServer } from "node:http";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, normalize } from "node:path";
const [dir, port = "3123"] = process.argv.slice(2);
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".css": "text/css", ".js": "text/javascript" };
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const full = join(dir, path);
  try {
    if (statSync(full).isDirectory()) {
      const items = readdirSync(full).map((f) => `<li><a href="${join(path, f)}">${f}</a></li>`).join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<ul>${items}</ul>`); return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(full)] ?? "application/octet-stream" });
    res.end(readFileSync(full));
  } catch { res.writeHead(404); res.end("not here"); }
}).listen(Number(port), () => console.log(`serving ${dir} on http://localhost:${port}`));
