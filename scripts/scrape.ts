import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  WIKI_BASE,
  extractCategoryMembers,
  extractSubcategories,
  parsePageMeta,
  parsePageBody,
  toFrontmatter,
  slugFromUrl,
  safeFilename,
  isAllowedArticleUrl,
  parseRobotsForUserAgent,
  isPathAllowedByRobots,
} from "../src/lib/scrape-helpers.js";

const UA = "TerrariaMageCompanion/0.1 (personal, contact: itherealak@gmail.com)";
const RATE_MS = 1000;
const RAW_DIR = path.resolve("data/raw");
const PARSED_DIR = path.resolve("data/parsed");

const CATEGORY_SEEDS = [
  "Magic_weapons",
  "Boss_NPCs",
  "Armor_sets",
  "Accessory_items",
  "Events",
];

const OVERVIEW_SEEDS = ["Bosses", "Biomes", "Ores", "Potions", "NPCs"];

type Args = {
  limit?: number;
  only?: Set<string>;
  dryRun: boolean;
  enumerate: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, enumerate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--only") out.only = new Set(argv[++i].split(",").map((s) => s.trim()));
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--enumerate") out.enumerate = true;
  }
  return out;
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

let lastFetchAt = 0;
async function politeFetch(url: string): Promise<{ status: number; body: string }> {
  const wait = Math.max(0, RATE_MS - (Date.now() - lastFetchAt));
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  const body = await res.text();
  return { status: res.status, body };
}

async function ensureDirs() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(PARSED_DIR, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchRobotsRules() {
  const { status, body } = await politeFetch(`${WIKI_BASE}/robots.txt`);
  if (status !== 200) throw new Error(`robots.txt fetch failed: ${status}`);
  const rules = parseRobotsForUserAgent(body, UA);
  if (!isPathAllowedByRobots("/wiki/Water_Bolt", rules)) {
    throw new Error("/wiki/ disallowed by robots.txt for our UA — aborting scrape");
  }
  return rules;
}

async function fetchCategoryMembers(
  category: string,
  visited = new Set<string>(),
  depth = 0,
): Promise<string[]> {
  const url = `${WIKI_BASE}/wiki/Category:${encodeURIComponent(category)}`;
  if (visited.has(url)) return [];
  visited.add(url);
  const indent = "  ".repeat(depth);
  console.log(`${indent}[cat] ${category}`);
  const { status, body } = await politeFetch(url);
  if (status !== 200) {
    console.warn(`${indent}  ! ${status} for ${url}`);
    return [];
  }
  const $ = cheerio.load(body);
  const members = extractCategoryMembers($);
  const subs = extractSubcategories($);
  console.log(`${indent}  → ${members.length} members, ${subs.length} subcats`);
  const all = [...members];
  if (depth < 1) {
    for (const sub of subs) {
      const subName = decodeURIComponent(new URL(sub).pathname.split("/Category:")[1]);
      const subMembers = await fetchCategoryMembers(subName, visited, depth + 1);
      for (const m of subMembers) if (!all.includes(m)) all.push(m);
    }
  }
  return all;
}

async function saveRaw(slug: string, html: string) {
  const file = path.join(RAW_DIR, `${safeFilename(slug)}.html`);
  await writeFile(file, html, "utf8");
}

async function saveParsed(slug: string, frontmatter: string, body: string) {
  const file = path.join(PARSED_DIR, `${safeFilename(slug)}.md`);
  const content = `${frontmatter}\n\n${body}\n`;
  await writeFile(file, content, "utf8");
}

async function rawPath(slug: string) {
  return path.join(RAW_DIR, `${safeFilename(slug)}.html`);
}

async function loadOrFetchPage(
  url: string,
  rules: ReturnType<typeof parseRobotsForUserAgent>,
): Promise<{ html: string; cached: boolean } | null> {
  if (!isAllowedArticleUrl(url)) return null;
  const u = new URL(url);
  if (!isPathAllowedByRobots(u.pathname + (u.search || ""), rules)) return null;

  const slug = slugFromUrl(url);
  const rp = await rawPath(slug);
  if (existsSync(rp)) {
    const html = await readFile(rp, "utf8");
    return { html, cached: true };
  }
  const { status, body } = await politeFetch(url);
  if (status !== 200) {
    console.warn(`  ! ${status} for ${url}`);
    return null;
  }
  await saveRaw(slug, body);
  return { html: body, cached: false };
}

async function processPage(url: string, html: string): Promise<void> {
  const slug = slugFromUrl(url);
  const meta = parsePageMeta(html, url);
  const body = parsePageBody(html);
  if (!body.trim()) {
    console.warn(`  ! empty body for ${url}`);
    return;
  }
  await saveParsed(slug, toFrontmatter(meta), body);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureDirs();

  console.log(`UA: ${UA}`);
  const rules = await fetchRobotsRules();
  console.log(`robots.txt: OK for ${UA}`);

  const todo = new Set<string>();
  const fromCats = args.only ? CATEGORY_SEEDS.filter((c) => args.only!.has(c)) : CATEGORY_SEEDS;
  const fromOverviews = args.only
    ? OVERVIEW_SEEDS.filter((o) => args.only!.has(o))
    : OVERVIEW_SEEDS;

  const perCat: Record<string, number> = {};
  for (const cat of fromCats) {
    const before = todo.size;
    const members = await fetchCategoryMembers(cat);
    for (const m of members) todo.add(m);
    perCat[cat] = todo.size - before;
  }
  const catTotal = todo.size;

  for (const ov of fromOverviews) {
    const url = `${WIKI_BASE}/wiki/${encodeURIComponent(ov)}`;
    todo.add(url);
  }

  if (args.enumerate) {
    const totalCatMembers = Object.values(perCat).reduce((a, b) => a + b, 0);
    console.log("\n=== Enumeration breakdown ===");
    console.log("Categories (members + one-level subcategory recursion):");
    for (const cat of fromCats) console.log(`  ${cat.padEnd(20)} ${perCat[cat]}`);
    console.log(`  ${"subtotal".padEnd(20)} ${totalCatMembers}`);
    console.log("\nOverview pages (scraped as-is, no link harvest):");
    for (const ov of fromOverviews) console.log(`  ${ov}`);
    console.log(`\nTOTAL unique URLs to fetch: ${todo.size}`);
    console.log(`Est. wall time @ 1 req/sec: ${Math.ceil(todo.size / 60)} min`);
    return;
  }

  let urls = [...todo];
  if (args.limit) urls = urls.slice(0, args.limit);

  console.log(`\nQueue: ${urls.length} pages`);
  if (args.dryRun) {
    for (const u of urls) console.log(`  - ${u}`);
    return;
  }

  let i = 0;
  for (const url of urls) {
    i++;
    const slug = slugFromUrl(url);
    const r = await loadOrFetchPage(url, rules);
    if (!r) continue;
    await processPage(url, r.html);

    const tag = r.cached ? "cache" : "fetch";
    console.log(`[${i}/${urls.length}] ${tag}  ${slug}`);
  }

  console.log(`\nDone. ${urls.length} pages processed.`);
  console.log(`raw:    ${RAW_DIR}`);
  console.log(`parsed: ${PARSED_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
