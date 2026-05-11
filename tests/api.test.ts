import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import type { Chunk, QueryResponse } from "@/types";
import { PROGRESSION_FILE, SEED_PROGRESSION } from "@/lib/progression";

vi.mock("@/lib/embedding", () => ({
  embedQuery: vi.fn(async () => new Array(1536).fill(0.1)),
}));

vi.mock("@/lib/rag", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag")>("@/lib/rag");
  const fakeChunk: Chunk = {
    id: "Water_Bolt#0",
    page_title: "Water Bolt",
    page_url: "https://terraria.wiki.gg/wiki/Water_Bolt",
    section: "Overview",
    text: "Water Bolt > Overview\n\nPierces and bounces.",
    image_url: "https://terraria.wiki.gg/images/Water_Bolt.png",
    categories: ["Magic weapons"],
    embedding: new Array(1536).fill(0.1),
  };
  return {
    ...actual,
    loadIndex: vi.fn(async () => [fakeChunk]),
  };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  const response: QueryResponse = {
    items: [
      {
        name: "Water Bolt",
        image_url: "https://terraria.wiki.gg/images/Water_Bolt.png",
        why_it_matters: "Pierces and bounces — great vs worm bosses.",
      },
    ],
    next_steps: ["kill EoW for Demonite"],
    warnings: [],
  };
  return {
    ...actual,
    answer: vi.fn(async () => response),
    answerStream: vi.fn(async function* () {
      // Yield the JSON in two chunks to exercise streaming consumption.
      const full = JSON.stringify(response);
      yield full.slice(0, 30);
      yield full.slice(30);
    }),
  };
});

// imports AFTER mocks
const { POST: queryPOST } = await import("@/app/api/query/route");
const { GET: stateGET, PATCH: statePATCH } = await import("@/app/api/state/route");

let originalProgression: string | null = null;

beforeEach(async () => {
  try {
    originalProgression = await fs.readFile(PROGRESSION_FILE, "utf8");
  } catch {
    originalProgression = null;
  }
  try {
    await fs.unlink(PROGRESSION_FILE);
  } catch {}
});

afterEach(async () => {
  if (originalProgression !== null) {
    await fs.writeFile(PROGRESSION_FILE, originalProgression);
  } else {
    try {
      await fs.unlink(PROGRESSION_FILE);
    } catch {}
  }
});

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/query", () => {
  it("returns 400 on missing query field", async () => {
    const res = await queryPOST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await queryPOST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("streams heartbeat + metadata + LLM JSON in the framed protocol", async () => {
    const res = await queryPOST(makeRequest("POST", { query: "just got Water Bolt, what now?" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);

    const text = await res.text();
    // Heartbeat newline first.
    expect(text.startsWith("\n")).toBe(true);
    const afterHeartbeat = text.slice(1);
    const nl = afterHeartbeat.indexOf("\n");
    expect(nl).toBeGreaterThan(0);
    const metaLine = afterHeartbeat.slice(0, nl);
    const meta = JSON.parse(metaLine) as {
      allowed_image_urls: string[];
      timing: { load: number; retrieve: number };
    };
    expect(meta.allowed_image_urls).toContain(
      "https://terraria.wiki.gg/images/Water_Bolt.png",
    );
    expect(typeof meta.timing.load).toBe("number");
    expect(typeof meta.timing.retrieve).toBe("number");

    const llmBody = afterHeartbeat.slice(nl + 1);
    const body = JSON.parse(llmBody) as QueryResponse;
    expect(body.items[0].name).toBe("Water Bolt");
    expect(body.items[0].image_url).toMatch(/Water_Bolt\.png/);
    expect(body.next_steps.length).toBeGreaterThan(0);
    expect(Array.isArray(body.warnings)).toBe(true);
  });
});

describe("GET /api/state", () => {
  it("returns the seeded progression when file does not exist", async () => {
    const res = await stateGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(SEED_PROGRESSION);
  });
});

describe("PATCH /api/state", () => {
  it("merges fields and re-derives stage when bosses change", async () => {
    const res = await statePATCH(
      makeRequest("PATCH", {
        bosses_defeated: ["Eye of Cthulhu"],
        current_armor: "Jungle armor",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("pre-hardmode");
    expect(body.bosses_defeated).toEqual(["Eye of Cthulhu"]);
    expect(body.current_armor).toBe("Jungle armor");

    const persisted = JSON.parse(await fs.readFile(PROGRESSION_FILE, "utf8"));
    expect(persisted.stage).toBe("pre-hardmode");
  });

  it("rejects non-object body", async () => {
    const res = await statePATCH(makeRequest("PATCH", null));
    expect(res.status).toBe(400);
  });
});
