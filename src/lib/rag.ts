import { promises as fs } from "node:fs";
import type { Chunk } from "../types.js";

export type { Chunk };

let _cache: { path: string; chunks: Chunk[] } | null = null;

export async function loadIndex(filePath: string): Promise<Chunk[]> {
  if (_cache && _cache.path === filePath) return _cache.chunks;
  const raw = await fs.readFile(filePath, "utf8");
  const chunks = JSON.parse(raw) as Chunk[];
  _cache = { path: filePath, chunks };
  return chunks;
}

export function clearIndexCache(): void {
  _cache = null;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type Scored = { chunk: Chunk; score: number };

export function topK(queryEmbedding: number[], chunks: Chunk[], k: number): Scored[] {
  const scored: Scored[] = chunks.map((c) => ({
    chunk: c,
    score: cosine(queryEmbedding, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// Literal+synth interleave with dedup: a single concatenated embedding can't serve biome queries AND progression-pivot queries simultaneously (zero-sum); two passes preserve both. synthCount is intent-driven (1 for warning, 3 for progression, 2 for general).
export async function retrieveWithProgression(
  userQuery: string,
  synthQuery: string | null,
  embed: (q: string) => Promise<number[]>,
  chunks: Chunk[],
  k: number,
  synthCount = Math.floor((k * 2) / 8),
): Promise<Chunk[]> {
  const [literalEmb, synthEmb] = await Promise.all([
    embed(userQuery),
    synthQuery ? embed(synthQuery) : Promise.resolve(null),
  ]);
  const literalTop = topK(literalEmb, chunks, k);
  if (!synthEmb) return literalTop.map((s) => s.chunk);

  const literalCount = k - synthCount;
  const synthTop = topK(synthEmb, chunks, k);

  const seen = new Set<string>();
  const merged: Chunk[] = [];
  for (const s of literalTop) {
    if (merged.length >= literalCount) break;
    if (seen.has(s.chunk.id)) continue;
    merged.push(s.chunk);
    seen.add(s.chunk.id);
  }
  for (const s of synthTop) {
    if (merged.length >= k) break;
    if (seen.has(s.chunk.id)) continue;
    merged.push(s.chunk);
    seen.add(s.chunk.id);
  }
  for (const s of literalTop) {
    if (merged.length >= k) break;
    if (seen.has(s.chunk.id)) continue;
    merged.push(s.chunk);
    seen.add(s.chunk.id);
  }
  return merged.slice(0, k);
}
