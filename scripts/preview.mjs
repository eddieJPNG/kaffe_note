/**
 * Servidor estático mínimo para testar o build em ./out localmente.
 * Reproduz os cabeçalhos de segurança declarados no vercel.json (S1 da
 * auditoria) para que os testes locais reflitam o comportamento da Vercel.
 * Uso: npm run preview (porta 4173 por padrão)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.env.PORT ?? 4173);

/** Headers do vercel.json compilados em regex (source é estilo path-to-regexp). */
const securityHeaders = [];
try {
  const vercel = JSON.parse(
    await readFile(join(root, "..", "vercel.json"), "utf8"),
  );
  for (const entry of vercel.headers ?? []) {
    const pattern = new RegExp(entry.source);
    const headers = Object.fromEntries(
      (entry.headers ?? []).map((item) => [item.key.toLowerCase(), item.value]),
    );
    securityHeaders.push({ pattern, headers });
  }
} catch {
  // sem vercel.json: preview serve só content-type/cache
}

function headersFor(pathname) {
  const merged = {};
  for (const entry of securityHeaders) {
    if (entry.pattern.test(pathname)) Object.assign(merged, entry.headers);
  }
  return merged;
}

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
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    // URI malformada (% não seguido de hex): 404 em vez de derrubar o server.
    return null;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const candidate = normalize(join(root, pathname));
  // Igualdade ou prefixo COM separador: bloqueia diretórios irmãos
  // cujo nome começa com "out" (ex.: ../out2/arquivo) — KAF-03.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
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
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-cache",
    ...headersFor(rawPath),
  });
  res.end(body);
}).listen(port, "127.0.0.1", () => {
  // Bind explícito em loopback: o preview NÃO fica exposto na LAN (KAF-03).
  console.log(`preview: http://127.0.0.1:${port}`);
});
