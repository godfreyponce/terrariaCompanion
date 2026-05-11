import { promises as fs } from "node:fs";
import path from "node:path";
import { embedTexts } from "../src/lib/embedding.js";
import type { Chunk } from "../src/lib/rag.js";
import { slugFromUrl } from "../src/lib/scrape-helpers.js";
import { loadEnvFile } from "../src/lib/env-loader.js";

loadEnvFile(path.resolve(".env.local"));

const PARSED_DIR = path.resolve("data/parsed");

type Args = { only?: Set<string>; out: string; dryRun: boolean };
function parseArgs(argv: string[]): Args {
  const out: Args = { out: "data/index.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") out.only = new Set(argv[++i].split(",").map((s) => s.trim()));
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

type PageMeta = {
  url: string;
  title: string;
  categories: string[];
  primary_image_url: string;
};

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      return JSON.parse(t.startsWith("'") ? `"${t.slice(1, -1).replace(/"/g, '\\"')}"` : t);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function parseFrontmatter(content: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = { url: "", title: "", categories: [], primary_image_url: "" };
  if (!content.startsWith("---\n")) return { meta, body: content };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { meta, body: content };
  const yamlBlock = content.slice(4, end);
  const body = content.slice(end + 4).replace(/^\n+/, "");

  let currentList: "categories" | "infobox_image_urls" | null = null;
  for (const line of yamlBlock.split("\n")) {
    if (line.startsWith("  - ")) {
      if (currentList === "categories") meta.categories.push(unquote(line.slice(4)));
      continue;
    }
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "categories" || key === "infobox_image_urls") {
      currentList = key as "categories" | "infobox_image_urls";
      continue;
    }
    currentList = null;
    const v = unquote(val);
    if (key === "url") meta.url = v;
    else if (key === "title") meta.title = v;
    else if (key === "primary_image_url") meta.primary_image_url = v;
  }
  return { meta, body };
}

const MAX_TOKENS = 800;
const WORDS_TO_TOKENS = 1.3;

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * WORDS_TO_TOKENS);
}

function cleanHeading(s: string): string {
  return s.replace(/\s*\[edit\]\s*$/i, "").replace(/\\\[edit\\\]/g, "").trim();
}

function splitSections(body: string): { heading: string; content: string }[] {
  // Split first on h2, then within each h2, also split on h3.
  // h3 sections get composed headings: "<h2> > <h3>".
  const h2s: { heading: string; content: string }[] = [];
  let cur = { heading: "Overview", content: "" };
  for (const line of body.split("\n")) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (cur.content.trim()) h2s.push(cur);
      cur = { heading: cleanHeading(m[1]) || "Section", content: "" };
    } else {
      cur.content += line + "\n";
    }
  }
  if (cur.content.trim()) h2s.push(cur);

  const out: { heading: string; content: string }[] = [];
  for (const h2 of h2s) {
    const lines = h2.content.split("\n");
    const hasH3 = lines.some((l) => /^###\s+/.test(l));
    if (!hasH3) {
      out.push(h2);
      continue;
    }
    let preH3 = "";
    let inH3 = false;
    let h3 = { heading: "", content: "" };
    const flushH3 = () => {
      if (inH3 && h3.content.trim()) {
        out.push({ heading: `${h2.heading} > ${h3.heading}`, content: h3.content });
      }
    };
    for (const line of lines) {
      const m = line.match(/^###\s+(.*)$/);
      if (m) {
        if (!inH3 && preH3.trim()) {
          out.push({ heading: h2.heading, content: preH3 });
          preH3 = "";
        }
        flushH3();
        h3 = { heading: cleanHeading(m[1]) || "Section", content: "" };
        inH3 = true;
      } else if (inH3) {
        h3.content += line + "\n";
      } else {
        preH3 += line + "\n";
      }
    }
    flushH3();
    if (!inH3 && preH3.trim()) out.push({ heading: h2.heading, content: preH3 });
  }
  return out;
}

function chunkContent(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (estimateTokens(trimmed) <= MAX_TOKENS) return [trimmed];
  const paragraphs = trimmed.split(/\n{2,}/);
  const out: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;
  for (const p of paragraphs) {
    const t = estimateTokens(p);
    if (bufTokens + t > MAX_TOKENS && buf.length > 0) {
      out.push(buf.join("\n\n"));
      buf = [p];
      bufTokens = t;
    } else {
      buf.push(p);
      bufTokens += t;
    }
  }
  if (buf.length) out.push(buf.join("\n\n"));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allFiles = (await fs.readdir(PARSED_DIR)).filter((f) => f.endsWith(".md"));
  const files = args.only
    ? allFiles.filter((f) => args.only!.has(f.replace(/\.md$/, "")))
    : allFiles;
  console.log(`Selected ${files.length} files (of ${allFiles.length} total)`);

  type Pending = Omit<Chunk, "embedding">;
  const pending: Pending[] = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(PARSED_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(content);
    if (!meta.url || !meta.title) {
      console.warn(`! skipping (no frontmatter url/title): ${file}`);
      continue;
    }
    const slug = slugFromUrl(meta.url);
    const sections = splitSections(body);
    let chunkIdx = 0;
    for (const section of sections) {
      const pieces = chunkContent(section.content);
      for (const piece of pieces) {
        const text = `${meta.title} > ${section.heading}\n\n${piece}`;
        pending.push({
          id: `${slug}#${chunkIdx++}`,
          page_title: meta.title,
          page_url: meta.url,
          section: section.heading,
          text,
          image_url: meta.primary_image_url,
          categories: meta.categories,
        });
      }
    }
  }

  console.log(`Built ${pending.length} chunks from ${files.length} pages`);
  if (args.dryRun) {
    for (const c of pending.slice(0, 5)) {
      const preview = c.text.replace(/\n+/g, " ").slice(0, 120);
      console.log(`  ${c.id} [${c.section}] ${preview}...`);
    }
    return;
  }

  console.log(`Embedding ${pending.length} chunks via text-embedding-3-small...`);
  const t0 = Date.now();
  const embeddings = await embedTexts(pending.map((c) => c.text));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Embedded ${embeddings.length} chunks in ${elapsed}s`);

  const chunks: Chunk[] = pending.map((c, i) => ({ ...c, embedding: embeddings[i] }));
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(chunks));
  const sizeKB = (Buffer.byteLength(JSON.stringify(chunks)) / 1024).toFixed(0);
  console.log(`Wrote ${args.out} — ${chunks.length} chunks, ~${sizeKB} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
