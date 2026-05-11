import path from "node:path";
import { loadIndex, retrieveWithProgression, topK } from "../src/lib/rag.js";
import { embedQuery } from "../src/lib/embedding.js";
import { loadEnvFile } from "../src/lib/env-loader.js";
import { readProgression } from "../src/lib/progression.js";
import { buildSynthRetrievalQuery } from "../src/lib/llm.js";

loadEnvFile(path.resolve(".env.local"));

const DEFAULT_QUERIES = [
  "I just got the Water Bolt, what now?",
  "Just beat Eye of Cthulhu, what's next for a mage?",
  "What should I look out for in the Jungle?",
];

type Args = {
  index: string;
  k: number;
  queries: string[];
  withProgression: boolean;
};

function parseArgs(argv: string[]): Args {
  let index = "data/index.json";
  let k = 5;
  const queries: string[] = [];
  let withProgression = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--index") index = argv[++i];
    else if (a === "--k") k = Number(argv[++i]);
    else if (a === "--q") queries.push(argv[++i]);
    else if (a === "--with-progression") withProgression = true;
  }
  return { index, k, queries: queries.length ? queries : DEFAULT_QUERIES, withProgression };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chunks = await loadIndex(args.index);
  console.log(`Loaded ${chunks.length} chunks from ${args.index}`);
  const progression = args.withProgression ? await readProgression() : null;
  if (progression) {
    console.log(`Progression: stage=${progression.stage}, bosses=${progression.bosses_defeated.join("|") || "(none)"}\n`);
  } else {
    console.log("(progression augmentation OFF)\n");
  }

  const synthQuery = progression ? buildSynthRetrievalQuery(progression) : null;
  if (progression && synthQuery) console.log(`Synth query: ${synthQuery}\n`);

  for (const q of args.queries) {
    console.log("────────────────────────────────────────");
    console.log(`Q: ${q}`);
    console.log("────────────────────────────────────────");
    if (progression) {
      const top = await retrieveWithProgression(q, synthQuery, embedQuery, chunks, args.k);
      top.forEach((c, i) => {
        const preview = c.text.replace(/\s+/g, " ").slice(0, 110);
        console.log(`  [${i + 1}]  ${c.page_title} > ${c.section}`);
        console.log(`        "${preview}..."`);
      });
    } else {
      const emb = await embedQuery(q);
      const top = topK(emb, chunks, args.k);
      top.forEach((t, i) => {
        const preview = t.chunk.text.replace(/\s+/g, " ").slice(0, 110);
        console.log(
          `  [${i + 1}] ${t.score.toFixed(4)}  ${t.chunk.page_title} > ${t.chunk.section}`,
        );
        console.log(`        "${preview}..."`);
      });
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
