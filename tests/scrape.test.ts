import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import {
  extractTitle,
  extractCategories,
  extractInfoboxImages,
  extractCategoryMembers,
  extractSubcategories,
  extractArticleLinks,
  slugFromUrl,
  isAllowedArticleUrl,
  parseRobotsForUserAgent,
  isPathAllowedByRobots,
  toFrontmatter,
  parsePageMeta,
  parsePageBody,
} from "@/lib/scrape-helpers";

const ARTICLE_FIXTURE = `<!doctype html><html><head><title>Water Bolt</title></head><body>
<h1 id="firstHeading" class="firstHeading"><span>Water Bolt</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="infobox item">
  <div class="title">Water Bolt</div>
  <div class="mw-collapsible-content">
    <div class="section images">
      <ul class="infobox-inline">
        <li><img alt="Water Bolt item sprite" src="/images/Water_Bolt.png?abc" width="28" height="30" /></li>
        <li><img alt="Water Bolt placed" src="/images/Water_Bolt_placed.png" width="16" height="16" /></li>
      </ul>
    </div>
    <div class="auto"><img class="blackwhite-icon" src="/images/thumb/Auto_icon.png" /></div>
    <div class="stack"><span class="stackdigits"><img alt="9" src="/images/Stack_digit_9.png" /></span></div>
  </div>
</div>
<p>Water Bolt is a magic weapon that pierces and bounces.</p>
<h2><span class="mw-headline" id="Notes">Notes</span><span class="mw-editsection">[edit]</span></h2>
<p>Found on dungeon shelves before Skeletron.</p>
<div class="navbox">Nav stuff to strip</div>
<p>See also <a href="/wiki/Demon_Scythe">Demon Scythe</a> and <a href="/wiki/Special:Search">search</a>.</p>
</div></div>
<div id="catlinks" class="catlinks">
  <div class="mw-normal-catlinks">
    <a href="/wiki/Special:Categories">Categories</a>:
    <ul>
      <li><a href="/wiki/Category:Magic_weapons">Magic weapons</a></li>
      <li><a href="/wiki/Category:Pre-Hardmode_items">Pre-Hardmode items</a></li>
    </ul>
  </div>
</div>
</body></html>`;

const CATEGORY_FIXTURE = `<!doctype html><html><body>
<div id="mw-subcategories">
  <div class="mw-category-group">
    <ul>
      <li><a href="/wiki/Category:Magic_guns">Magic guns</a></li>
      <li><a href="/wiki/Category:Wands">Wands</a></li>
    </ul>
  </div>
</div>
<div id="mw-pages">
  <div class="mw-category-generated">
    <div class="mw-category-group">
      <h3>A</h3>
      <ul>
        <li><a href="/wiki/Adamantite_Headgear">Adamantite Headgear</a></li>
        <li><a href="/wiki/Apprentice_Cloak">Apprentice Cloak</a></li>
      </ul>
    </div>
    <div class="mw-category-group">
      <h3>S</h3>
      <ul>
        <li><a href="/wiki/Special:Listed_here">should be filtered</a></li>
        <li><a href="/wiki/Spectre_Mask">Spectre Mask</a></li>
      </ul>
    </div>
  </div>
</div>
</body></html>`;

describe("scrape-helpers", () => {
  it("extracts title from #firstHeading", () => {
    const $ = cheerio.load(ARTICLE_FIXTURE);
    expect(extractTitle($)).toBe("Water Bolt");
  });

  it("extracts category names from #catlinks", () => {
    const $ = cheerio.load(ARTICLE_FIXTURE);
    expect(extractCategories($)).toEqual(["Magic weapons", "Pre-Hardmode items"]);
  });

  it("extracts infobox images and skips decoration/icons", () => {
    const $ = cheerio.load(ARTICLE_FIXTURE);
    const { primary_image_url, infobox_image_urls } = extractInfoboxImages($);
    expect(primary_image_url).toBe(
      "https://terraria.wiki.gg/images/Water_Bolt.png?abc",
    );
    expect(infobox_image_urls).toEqual([
      "https://terraria.wiki.gg/images/Water_Bolt.png?abc",
      "https://terraria.wiki.gg/images/Water_Bolt_placed.png",
    ]);
  });

  it("extracts category members from #mw-pages only, skipping subcategories", () => {
    const $ = cheerio.load(CATEGORY_FIXTURE);
    const urls = extractCategoryMembers($);
    expect(urls).toEqual([
      "https://terraria.wiki.gg/wiki/Adamantite_Headgear",
      "https://terraria.wiki.gg/wiki/Apprentice_Cloak",
      "https://terraria.wiki.gg/wiki/Spectre_Mask",
    ]);
  });

  it("extracts subcategories from #mw-subcategories", () => {
    const $ = cheerio.load(CATEGORY_FIXTURE);
    const urls = extractSubcategories($);
    expect(urls).toEqual([
      "https://terraria.wiki.gg/wiki/Category:Magic_guns",
      "https://terraria.wiki.gg/wiki/Category:Wands",
    ]);
  });

  it("extracts article links from content body, filtering Special:", () => {
    const $ = cheerio.load(ARTICLE_FIXTURE);
    const urls = extractArticleLinks($);
    expect(urls).toContain("https://terraria.wiki.gg/wiki/Demon_Scythe");
    expect(urls.find((u) => u.includes("Special:"))).toBeUndefined();
  });

  it("slugFromUrl handles percent-encoding", () => {
    expect(slugFromUrl("https://terraria.wiki.gg/wiki/Demon_Scythe")).toBe("Demon_Scythe");
    expect(slugFromUrl("https://terraria.wiki.gg/wiki/Water_Bolt%20(placed)")).toBe(
      "Water_Bolt (placed)",
    );
  });

  it("isAllowedArticleUrl filters namespaces and action params", () => {
    expect(isAllowedArticleUrl("https://terraria.wiki.gg/wiki/Water_Bolt")).toBe(true);
    expect(isAllowedArticleUrl("https://terraria.wiki.gg/wiki/Special:Search")).toBe(false);
    expect(isAllowedArticleUrl("https://terraria.wiki.gg/wiki/File:foo.png")).toBe(false);
    expect(isAllowedArticleUrl("https://terraria.wiki.gg/wiki/Water_Bolt?action=edit")).toBe(false);
    expect(isAllowedArticleUrl("https://en.wikipedia.org/wiki/Water_Bolt")).toBe(false);
  });

  it("parses robots.txt and matches disallow patterns for User-agent *", () => {
    const robots = `User-agent: *
Disallow: /index.php
Disallow: /wiki/File:
Disallow: /*?action=
Allow: /wiki/

User-agent: GPTBot
Disallow: /
`;
    const rules = parseRobotsForUserAgent(robots, "TerrariaMageCompanion/0.1");
    expect(isPathAllowedByRobots("/wiki/Water_Bolt", rules)).toBe(true);
    expect(isPathAllowedByRobots("/wiki/File:foo.png", rules)).toBe(false);
    expect(isPathAllowedByRobots("/wiki/Water_Bolt?action=edit", rules)).toBe(false);
    expect(isPathAllowedByRobots("/index.php", rules)).toBe(false);
  });

  it("parses robots.txt and applies stricter rules for a specifically-named UA", () => {
    const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /
`;
    const rules = parseRobotsForUserAgent(robots, "GPTBot/1.0");
    expect(isPathAllowedByRobots("/wiki/Water_Bolt", rules)).toBe(false);
  });

  it("toFrontmatter emits valid YAML keys and lists", () => {
    const fm = toFrontmatter({
      url: "https://terraria.wiki.gg/wiki/Water_Bolt",
      title: "Water Bolt",
      categories: ["Magic weapons", "Pre-Hardmode items"],
      primary_image_url: "https://terraria.wiki.gg/images/Water_Bolt.png?abc",
      infobox_image_urls: ["https://terraria.wiki.gg/images/Water_Bolt.png?abc"],
    });
    expect(fm).toContain("---");
    expect(fm).toContain("url: https://terraria.wiki.gg/wiki/Water_Bolt");
    expect(fm).toContain("title: \"Water Bolt\"");
    expect(fm).toContain("- \"Magic weapons\"");
    expect(fm).toContain("- https://terraria.wiki.gg/images/Water_Bolt.png?abc");
  });

  it("parsePageMeta + parsePageBody integration", () => {
    const meta = parsePageMeta(ARTICLE_FIXTURE, "https://terraria.wiki.gg/wiki/Water_Bolt");
    expect(meta.title).toBe("Water Bolt");
    expect(meta.categories.length).toBe(2);
    expect(meta.primary_image_url).toMatch(/Water_Bolt\.png/);

    const md = parsePageBody(ARTICLE_FIXTURE);
    expect(md).toContain("Water Bolt is a magic weapon");
    expect(md).toContain("Notes");
    expect(md).not.toContain("[edit]");
    expect(md).not.toContain("Nav stuff to strip");
  });
});
