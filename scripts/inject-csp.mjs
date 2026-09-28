#!/usr/bin/env node
/**
 * Pós-build (S1 da auditoria de segurança): injeta a Content-Security-Policy
 * como <meta http-equiv> em todos os HTMLs de ./out.
 *
 * Por que meta e não header: com `output: export` o Next.js não emite
 * cabeçalhos customizados e os hashes sha256 dos scripts inline mudam a cada
 * build — o vercel.json é lido pela Vercel antes do build, portanto não pode
 * recebê-los. A diretiva `frame-ancestors` (ignorada em meta) fica no header
 * do vercel.json; o navegador aplica as duas políticas em conjunto.
 *
 * Executado automaticamente como parte de `npm run build`.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");

async function listHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHtmlFiles(full)));
    } else if (extname(entry.name) === ".html") {
      files.push(full);
    }
  }
  return files;
}

/** Corpos dos scripts inline (sem atributo src) — os externos cobrem 'self'. */
function inlineScriptBodies(html) {
  const bodies = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script\s*>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (/(?:^|\s)src\s*=/i.test(match[1])) continue;
    if (match[2].length === 0) continue;
    bodies.push(match[2]);
  }
  return bodies;
}

function sha256Token(value) {
  return `'sha256-${createHash("sha256").update(value, "utf8").digest("base64")}'`;
}

function buildCsp(html) {
  const hashes = [...new Set(inlineScriptBodies(html).map(sha256Token))];
  return [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(" ")}`,
    "style-src 'self'",
    // Atributos style= do React (ex.: font-size do textarea). style-src
    // permanece 'self' para elementos <style>.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Injeta a meta logo após a abertura de <head> (cobre todo o documento). */
function injectMeta(html, csp) {
  const stripped = html.replace(
    /<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/gi,
    "",
  );
  const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head([^>]*)>/i, (m) => `${m}${tag}`);
  }
  if (/<script/i.test(stripped)) {
    return stripped.replace(/<script/i, `${tag}<script`);
  }
  return null;
}

const files = await listHtmlFiles(outDir).catch(() => {
  console.error("inject-csp: diretório out/ não existe — rode `npm run build`.");
  process.exit(1);
});

if (files.length === 0) {
  console.error("inject-csp: nenhum HTML encontrado em out/.");
  process.exit(1);
}

let injected = 0;
for (const file of files) {
  const html = await readFile(file, "utf8");
  const csp = buildCsp(html);
  const next = injectMeta(html, csp);
  if (next === null) {
    console.error(`inject-csp: não foi possível injetar em ${file}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(file, next);
  injected += 1;
}

const indexHtml = await readFile(join(outDir, "index.html"), "utf8").catch(
  () => "",
);
const metaMatch = indexHtml.match(
  /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/,
);
const hashCount = metaMatch
  ? (metaMatch[1].match(/sha256-/g) ?? []).length
  : 0;

console.log(
  `inject-csp: CSP injetada em ${injected} HTML(s) — index.html com ${hashCount} hash(s) sha256.`,
);
if (metaMatch === null) {
  console.error("inject-csp: meta CSP ausente em out/index.html após injeção.");
  process.exit(1);
}
