#!/usr/bin/env node
/**
 * Gate de segurança (S1 da auditoria de segurança).
 *
 * Modos de uso:
 *   node scripts/verify-headers.mjs
 *     → valida o vercel.json (cabeçalhos obrigatórios) e o HTML de out/
 *       (meta CSP com hashes, sem 'unsafe-inline' em script-src).
 *       Roda no CI logo após o build.
 *
 *   node scripts/verify-headers.mjs http://127.0.0.1:4173
 *     → valida os cabeçalhos e a CSP de um servidor no ar (preview local
 *       ou deploy real na Vercel).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Verificações aplicáveis tanto ao vercel.json quanto à resposta HTTP. */
const REQUIRED_HEADERS = {
  "content-security-policy": (value) => value.includes("frame-ancestors 'none'"),
  "x-frame-options": (value) => value === "DENY",
  "x-content-type-options": (value) => value === "nosniff",
  "referrer-policy": (value) => value === "no-referrer",
  "permissions-policy": (value) => value.includes("camera=()"),
  "strict-transport-security": (value) => value.includes("max-age="),
};

let failures = 0;

function check(label, ok, detail = "") {
  if (ok) {
    console.log(`PASS - ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL - ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}

/** Checa a meta CSP do HTML: script-src com hashes e sem 'unsafe-inline'. */
function checkHtmlCsp(label, html) {
  const metaMatch = html.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i,
  );
  check(`${label}: meta CSP presente`, metaMatch !== null);
  if (metaMatch === null) return;
  const csp = metaMatch[1];
  check(`${label}: default-src 'none'`, csp.includes("default-src 'none'"));
  check(`${label}: script-src com hashes sha256`, /script-src [^;]*sha256-/.test(csp));
  const scriptSrc = (csp.match(/(?:^|;)\s*(script-src [^;]*)/) ?? [])[1] ?? "";
  check(
    `${label}: script-src sem 'unsafe-inline'`,
    scriptSrc.length > 0 && !scriptSrc.includes("'unsafe-inline'"),
    scriptSrc,
  );
}

function checkHeaders(label, headers) {
  // vercel.json usa lista [{key,value}]; resposta HTTP usa mapa key→value.
  const pairs = Array.isArray(headers)
    ? headers.map((item) => [item.key, item.value])
    : Object.entries(headers);
  const normalized = {};
  for (const [key, value] of pairs) {
    normalized[String(key).toLowerCase()] = String(value);
  }
  for (const [name, predicate] of Object.entries(REQUIRED_HEADERS)) {
    const value = normalized[name];
    check(
      `${label}: header ${name}`,
      typeof value === "string" && predicate(value),
      value === undefined ? "ausente" : value,
    );
  }
}

const target = process.argv[2];

if (target === undefined) {
  // ---------- modo config (CI) ----------
  let vercel;
  try {
    vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
    check("vercel.json: legível", true);
  } catch (error) {
    check("vercel.json: legível", false, String(error));
    process.exit(1);
  }

  const entries = Array.isArray(vercel.headers) ? vercel.headers : [];
  const allPaths = entries.find((entry) => entry.source === "/(.*)");
  check(
    'vercel.json: entrada de headers para "/(.*)"',
    allPaths !== undefined,
  );
  if (allPaths !== undefined) {
    checkHeaders("vercel.json", allPaths.headers ?? {});
  }

  check(
    "vercel.json: buildCommand/npm run build",
    vercel.buildCommand === "npm run build",
  );
  check("vercel.json: outputDirectory/out", vercel.outputDirectory === "out");

  try {
    const html = await readFile(join(root, "out", "index.html"), "utf8");
    checkHtmlCsp("out/index.html", html);
  } catch {
    check("out/index.html: presente (build)", false, "rode npm run build antes");
  }
} else {
  // ---------- modo URL (deploy/preview) ----------
  const url = new URL("/", target).toString();
  const response = await fetch(url, { redirect: "follow" });
  check(`GET ${url}: status 2xx`, response.status >= 200 && response.status < 300, String(response.status));
  checkHeaders(url, Object.fromEntries(response.headers.entries()));
  const html = await response.text();
  checkHtmlCsp(url, html);
}

console.log(failures === 0 ? "verify-headers: tudo OK." : `verify-headers: ${failures} falha(s).`);
process.exit(failures === 0 ? 0 : 1);
