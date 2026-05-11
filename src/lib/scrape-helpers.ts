import * as cheerio from "cheerio";
import TurndownService from "turndown";

export const WIKI_BASE = "https://terraria.wiki.gg";

export type PageMeta = {
  url: string;
  title: string;
  categories: string[];
  primary_image_url: string;
  infobox_image_urls: string[];
};

export function slugFromUrl(url: string): string {
  const u = new URL(url, WIKI_BASE);
  const m = u.pathname.match(/^\/wiki\/(.+)$/);
  if (!m) throw new Error(`not a /wiki/ url: ${url}`);
  return decodeURIComponent(m[1]).replace(/\//g, "_");
}

export function urlFromSlug(slug: string): string {
  return `${WIKI_BASE}/wiki/${encodeURIComponent(slug).replace(/%2F/g, "/")}`;
}

export function safeFilename(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function resolveUrl(href: string, base = WIKI_BASE): string {
  return new URL(href, base).href;
}

const DISALLOWED_NAMESPACES = [
  "File:",
  "Special:",
  "User:",
  "User_talk:",
  "Talk:",
  "MediaWiki:",
  "Data:",
  "Template:",
  "Template_talk:",
  "Help:",
  "Help_talk:",
  "Project:",
  "Project_talk:",
  "Module:",
  "Category_talk:",
  "Image:",
];

const DISALLOWED_QUERY_PARAMS = [
  "action",
  "veaction",
  "diff",
  "oldid",
  "curid",
  "wprov",
  "from",
  "redirect",
  "pagefrom",
  "pageuntil",
  "filefrom",
  "fileuntil",
  "uselang",
  "useskin",
  "printable",
  "search",
  "feed",
  "title",
  "cmpscreen",
];

export function isAllowedArticleUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url, WIKI_BASE);
  } catch {
    return false;
  }
  if (u.hostname !== "terraria.wiki.gg") return false;
  if (!u.pathname.startsWith("/wiki/")) return false;
  const tail = u.pathname.slice("/wiki/".length);
  for (const ns of DISALLOWED_NAMESPACES) {
    if (tail.startsWith(ns) || tail.startsWith(encodeURIComponent(ns))) return false;
  }
  for (const p of DISALLOWED_QUERY_PARAMS) {
    if (u.searchParams.has(p)) return false;
  }
  return true;
}

export function isAllowedCategoryUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url, WIKI_BASE);
  } catch {
    return false;
  }
  if (u.hostname !== "terraria.wiki.gg") return false;
  if (!u.pathname.startsWith("/wiki/Category:")) return false;
  for (const p of DISALLOWED_QUERY_PARAMS) {
    if (u.searchParams.has(p)) return false;
  }
  return true;
}

export function extractTitle($: cheerio.CheerioAPI): string {
  const h1 = $("#firstHeading").first();
  return h1.text().trim();
}

export function extractCategories($: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  $("#catlinks .mw-normal-catlinks ul li a").each((_, el) => {
    const text = $(el).text().trim();
    if (text) out.push(text);
  });
  return out;
}

const IMAGE_EXCLUDE_PATTERNS = [
  /Stack_digit/i,
  /Auto_icon/i,
  /Coin_/i,
  /Mana_Star/i,
  /Heart\./i,
  /Damage_type/i,
];

export function extractInfoboxImages(
  $: cheerio.CheerioAPI,
  baseUrl = WIKI_BASE,
): { primary_image_url: string; infobox_image_urls: string[] } {
  const $infobox = $(".infobox").first();
  const urls: string[] = [];
  if (!$infobox.length) return { primary_image_url: "", infobox_image_urls: [] };

  const candidates = $infobox.find(".section.images img, ul.infobox-inline img, .images img");
  candidates.each((_, el) => {
    const $img = $(el);
    if ($img.closest(".stack").length) return;
    if ($img.closest(".coinprice").length) return;
    if ($img.hasClass("blackwhite-icon")) return;
    const src = $img.attr("src");
    if (!src) return;
    if (IMAGE_EXCLUDE_PATTERNS.some((re) => re.test(src))) return;
    const abs = resolveUrl(src, baseUrl);
    if (!urls.includes(abs)) urls.push(abs);
  });

  if (urls.length === 0) {
    const firstImg = $infobox.find("img").first();
    const src = firstImg.attr("src");
    if (src && !IMAGE_EXCLUDE_PATTERNS.some((re) => re.test(src))) {
      urls.push(resolveUrl(src, baseUrl));
    }
  }

  return { primary_image_url: urls[0] ?? "", infobox_image_urls: urls };
}

const NOISE_SELECTORS = [
  ".mw-editsection",
  ".navbox",
  ".navigation-not-searchable",
  ".toc",
  "script",
  "style",
  "noscript",
  ".mw-cookiewarning-container",
  ".printfooter",
  ".mw-jump-link",
  ".mw-indicators",
  "#siteSub",
  ".reference",
  ".references",
  ".mw-references-wrap",
  ".mw-empty-elt",
  ".collapsible-toggle-wrapper",
];

export function cleanContent($: cheerio.CheerioAPI): string {
  const $content = $("#mw-content-text .mw-parser-output").first();
  if (!$content.length) return "";
  for (const sel of NOISE_SELECTORS) $content.find(sel).remove();
  return $content.html() ?? "";
}

let _td: TurndownService | null = null;
function turndown(): TurndownService {
  if (_td) return _td;
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  td.remove(["script", "style", "noscript"]);
  _td = td;
  return td;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown().turndown(html).trim();
}

export function parsePageMeta(html: string, url: string): PageMeta {
  const $ = cheerio.load(html);
  const title = extractTitle($);
  const categories = extractCategories($);
  const imgs = extractInfoboxImages($, url);
  return {
    url,
    title,
    categories,
    primary_image_url: imgs.primary_image_url,
    infobox_image_urls: imgs.infobox_image_urls,
  };
}

export function parsePageBody(html: string): string {
  const $ = cheerio.load(html);
  return htmlToMarkdown(cleanContent($));
}

export function extractCategoryMembers($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();
  $("#mw-pages .mw-category-group ul li a, #mw-pages .mw-category a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = resolveUrl(href);
    if (isAllowedArticleUrl(abs)) out.add(abs);
  });
  return [...out];
}

export function extractSubcategories($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();
  $("#mw-subcategories .mw-category-group ul li a, #mw-subcategories .mw-category a").each(
    (_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = resolveUrl(href);
      if (isAllowedCategoryUrl(abs)) out.add(abs);
    },
  );
  return [...out];
}

export function extractArticleLinks($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();
  $("#mw-content-text .mw-parser-output a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.startsWith("/wiki/")) {
      const abs = resolveUrl(href);
      if (isAllowedArticleUrl(abs)) out.add(abs.split("#")[0]);
    }
  });
  return [...out];
}

function yamlScalar(s: string): string {
  if (s === "" || /^[a-zA-Z0-9_./?:=&%+-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

export function toFrontmatter(meta: PageMeta): string {
  const lines: string[] = ["---"];
  lines.push(`url: ${yamlScalar(meta.url)}`);
  lines.push(`title: ${yamlScalar(meta.title)}`);
  lines.push("categories:");
  for (const c of meta.categories) lines.push(`  - ${yamlScalar(c)}`);
  lines.push(`primary_image_url: ${yamlScalar(meta.primary_image_url)}`);
  lines.push("infobox_image_urls:");
  for (const u of meta.infobox_image_urls) lines.push(`  - ${yamlScalar(u)}`);
  lines.push("---");
  return lines.join("\n");
}

export type RobotsRules = { disallow: string[]; allow: string[] };

export function parseRobotsForUserAgent(text: string, userAgent: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      lastWasAgent = false;
      continue;
    }
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [], allow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.trim().toLowerCase());
      lastWasAgent = true;
    } else if (k === "disallow" && cur) {
      if (val.trim()) cur.disallow.push(val.trim());
      lastWasAgent = false;
    } else if (k === "allow" && cur) {
      if (val.trim()) cur.allow.push(val.trim());
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const uaLower = userAgent.toLowerCase();
  let chosen: { disallow: string[]; allow: string[] } | null = null;
  for (const g of groups) {
    if (g.agents.some((a) => a !== "*" && uaLower.includes(a))) {
      chosen = { disallow: g.disallow, allow: g.allow };
      break;
    }
  }
  if (!chosen) {
    const star = groups.find((g) => g.agents.includes("*"));
    chosen = star ? { disallow: star.disallow, allow: star.allow } : { disallow: [], allow: [] };
  }
  return chosen;
}

export function isPathAllowedByRobots(pathWithQuery: string, rules: RobotsRules): boolean {
  function matches(pattern: string, target: string): boolean {
    if (!pattern) return false;
    if (!pattern.includes("*") && !pattern.includes("$")) {
      return target.startsWith(pattern);
    }
    let re = "^";
    for (const ch of pattern) {
      if (ch === "*") re += ".*";
      else if (ch === "$") re += "$";
      else re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(re).test(target);
  }
  const allowHit = rules.allow.find((p) => matches(p, pathWithQuery));
  const disallowHit = rules.disallow.find((p) => matches(p, pathWithQuery));
  if (allowHit && disallowHit) return allowHit.length >= disallowHit.length;
  if (disallowHit) return false;
  return true;
}
