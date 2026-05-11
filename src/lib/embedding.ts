import OpenAI from "openai";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMS = 1536;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set (expected in .env.local)");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

const BATCH_SIZE = 100;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const res = await client().embeddings.create({
      model: EMBED_MODEL,
      input: slice,
    });
    for (const d of res.data) out.push(d.embedding);
  }
  return out;
}

export async function embedQuery(q: string): Promise<number[]> {
  const [v] = await embedTexts([q]);
  return v;
}
