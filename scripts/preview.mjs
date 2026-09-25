/**
 * Servidor estático mínimo para testar o build em ./out localmente.
 * Uso: npm run preview (porta 4173 por padrão)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.env.PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

async function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname.endsWith("/")) pathname += "index.html";
  const candidate = normalize(join(root, pathname));
  if (!candidate.startsWith(root)) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      return await readFile(join(candidate, "index.html"));
    }
    return await readFile(candidate);
  } catch {
    try {
      return await readFile(join(root, "index.html"));
    } catch {
      return null;
    }
  }
}

createServer(async (req, res) => {
  const body = await resolveFile(req.url ?? "/");
  if (body === null) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const rawPath = req.url?.split("?")[0] ?? "/index.html";
  const ext = extname(rawPath === "/" ? "index.html" : rawPath) || ".html";
  const type = MIME[ext] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  res.end(body);
}).listen(port, () => {
  console.log(`preview: http://localhost:${port}`);
});
