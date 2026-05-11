import { NextResponse } from "next/server";
import path from "node:path";
import { loadIndex, retrieveWithProgression } from "@/lib/rag";
import { embedQuery } from "@/lib/embedding";
import { answerStream, buildSynthRetrievalQuery } from "@/lib/llm";
import {
  readProgression,
  ProgressionInputSchema,
  normalizeProgressionInput,
} from "@/lib/progression";
import { classifyIntent, type Intent } from "@/lib/intent";
import { loadEnvFile } from "@/lib/env-loader";
import type { QueryRequest } from "@/types";

const SYNTH_BY_INTENT: Record<Intent, number> = {
  warning: 1,
  general: 2,
  progression: 3,
};

loadEnvFile(path.resolve(".env.local"));

const TOP_K = 8;
const INDEX_PATH = path.resolve("data/index.json");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Wire format:
//   "\n"                                     <- heartbeat, immediate (flushes headers, signals "loading")
//   "<json metadata>\n"                      <- after retrieval (allowed_image_urls + timing)
//   <streamed LLM JSON bytes>                <- as LLM produces them
// Client splits on the first two newlines, then partial-parses everything after as the LLM JSON object.

export async function POST(req: Request): Promise<Response> {
  let body: QueryRequest;
  try {
    body = (await req.json()) as QueryRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const userQuery = body?.query?.trim();
  if (!userQuery) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  let inlineProgression: ReturnType<typeof normalizeProgressionInput> | null = null;
  if (body.progression !== undefined) {
    const parsed = ProgressionInputSchema.safeParse(body.progression);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid progression" }, { status: 400 });
    }
    inlineProgression = normalizeProgressionInput(parsed.data);
  }

  const intent: Intent = classifyIntent(userQuery);
  const synthCount = SYNTH_BY_INTENT[intent];

  const t0 = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("\n"));

        const [progression, chunks] = await Promise.all([
          inlineProgression ? Promise.resolve(inlineProgression) : readProgression(),
          loadIndex(INDEX_PATH),
        ]);
        const tLoad = Date.now();

        const synthQuery = buildSynthRetrievalQuery(progression);
        const top = await retrieveWithProgression(
          userQuery,
          synthQuery,
          embedQuery,
          chunks,
          TOP_K,
          synthCount,
        );
        const tRetrieve = Date.now();

        const allowedUrls = top.map((c) => c.image_url).filter(Boolean);
        const meta = {
          allowed_image_urls: allowedUrls,
          intent,
          timing: { load: tLoad - t0, retrieve: tRetrieve - tLoad },
        };
        controller.enqueue(encoder.encode(JSON.stringify(meta) + "\n"));

        let firstTokenAt = -1;
        for await (const delta of answerStream(userQuery, progression, top, intent)) {
          if (firstTokenAt === -1) firstTokenAt = Date.now();
          controller.enqueue(encoder.encode(delta));
        }
        const tEnd = Date.now();
        const llmFirstTokenMs = firstTokenAt === -1 ? -1 : firstTokenAt - tRetrieve;
        console.log(
          `[query intent=${intent} synth=${synthCount}] load=${tLoad - t0}ms retrieve=${tRetrieve - tLoad}ms llm-first-token=${llmFirstTokenMs}ms llm-total=${tEnd - tRetrieve}ms request-total=${tEnd - t0}ms`,
        );
        controller.close();
      } catch (err) {
        controller.error(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "x-intent-classified": intent,
    },
  });
}
