import path from "node:path";
import { loadIndex, retrieveWithProgression } from "../src/lib/rag.js";
import { embedQuery } from "../src/lib/embedding.js";
import { answer, buildSynthRetrievalQuery } from "../src/lib/llm.js";
import { classifyIntent, type Intent } from "../src/lib/intent.js";
import { loadEnvFile } from "../src/lib/env-loader.js";
import { EVAL_QUERIES } from "../tests/eval-queries.js";

loadEnvFile(path.resolve(".env.local"));

const TOP_K = 8;
const SYNTH_BY_INTENT: Record<Intent, number> = {
  warning: 1,
  general: 2,
  progression: 3,
};

async function main() {
  const includeLlm = process.argv.includes("--with-llm");
  const onlyName = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;

  const chunks = await loadIndex("data/index.json");
  console.log(`Loaded ${chunks.length} chunks from data/index.json\n`);

  let classifierMismatches = 0;

  for (const q of EVAL_QUERIES) {
    if (onlyName && q.name !== onlyName) continue;
    const intent = classifyIntent(q.query);
    const synthCount = SYNTH_BY_INTENT[intent];
    const synthQuery = buildSynthRetrievalQuery(q.progression);
    const top = await retrieveWithProgression(
      q.query,
      synthQuery,
      embedQuery,
      chunks,
      TOP_K,
      synthCount,
    );
    const intentMatch = intent === q.intent;
    if (!intentMatch) classifierMismatches++;

    console.log("════════════════════════════════════════");
    console.log(`[${q.name}]`);
    console.log(`Query:       ${q.query}`);
    console.log(
      `Intent:      classified=${intent} expected=${q.intent} ${intentMatch ? "✓" : "✗ MISMATCH"}  synth=${synthCount}/${TOP_K}`,
    );
    console.log(
      `Stage:       ${q.progression.stage}, bosses=[${q.progression.bosses_defeated.join(", ")}]`,
    );
    console.log(`Expect:      ${q.expect}`);
    console.log("─ top-8 ─");
    top.forEach((c, i) => console.log(`  [${i + 1}]  ${c.page_title} > ${c.section}`));

    if (includeLlm) {
      console.log("─ LLM answer ─");
      try {
        const result = await answer(q.query, q.progression, top, intent);
        console.log(
          `  items: ${result.items.length === 0 ? "[]" : result.items.map((x) => x.name).join(", ")}`,
        );
        for (const item of result.items) {
          console.log(`    - ${item.name}: ${item.why_it_matters}`);
        }
        console.log(`  next_steps: ${result.next_steps.join(" | ")}`);
        if (result.warnings.length)
          console.log(`  warnings:   ${result.warnings.join(" | ")}`);
      } catch (err) {
        console.log(`  LLM ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log();
  }

  if (classifierMismatches > 0) {
    console.log(`! ${classifierMismatches} classifier mismatch(es) — tune regex in src/lib/intent.ts\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
