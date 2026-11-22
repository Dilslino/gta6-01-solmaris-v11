// SOLMARIS V4 fix: README badges linked, transcript touch.
// SOLMARIS — entrypoint (stdlib-only).
// Run with `node main.ts` (Node >= 22 type-stripping) or just open index.html.
// This script NEVER deletes any directory. It only verifies the game files
// exist and, optionally, serves them locally for playtesting.
//
// Usage:
//   node main.ts            -> verify files, print how to play
//   node main.ts --serve    -> verify files, then serve on http://127.0.0.1:8123
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED: string[] = [
  "index.html",
  "README.md",
  "LICENSE",
  "game/main.js",
  "game/world.js",
  "game/entities.js",
  "game/missions.js",
  "game/save.js",
  "game/audio.js",
  "game/input.js",
];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

function checkFiles(): string[] {
  const missing: string[] = [];
  for (const rel of REQUIRED) {
    const p: string = path.join(__dirname, rel);
    if (!fs.existsSync(p)) missing.push(rel);
  }
  return missing;
}

function main(): void {
  const missing: string[] = checkFiles();
  if (missing.length > 0) {
    console.error("SOLMARIS: missing files: " + missing.join(", "));
    process.exitCode = 1;
    return;
  }
  console.log("SOLMARIS — all " + REQUIRED.length + " game files present.");
  console.log("Play: open index.html in a browser, or run: node main.ts --serve");

  if (!process.argv.includes("--serve")) return;

  const server = http.createServer((req, res) => {
    const urlPath: string = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel: string = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const safe: string = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath: string = path.join(__dirname, safe);
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403); res.end("forbidden"); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      const ext: string = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  server.listen(8123, "127.0.0.1", () => {
    console.log("SOLMARIS serving at http://127.0.0.1:8123 — press Ctrl+C to stop.");
  });
}

main();
