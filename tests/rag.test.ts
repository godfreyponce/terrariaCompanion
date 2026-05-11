import { describe, it, expect } from "vitest";
import { cosine, topK, type Chunk } from "@/lib/rag";

function chunk(id: string, embedding: number[]): Chunk {
  return {
    id,
    page_title: id,
    page_url: "",
    section: "",
    text: "",
    image_url: "",
    categories: [],
    embedding,
  };
}

describe("rag", () => {
  it("cosine of identical vector is 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("cosine of orthogonal vectors is 0", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it("cosine of opposite vectors is -1", () => {
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("cosine on mismatched length returns 0", () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
  });

  it("topK orders by descending cosine and respects k", () => {
    const query = [1, 1, 0];
    const chunks = [
      chunk("a", [0, 0, 1]),
      chunk("b", [1, 1, 0]),
      chunk("c", [1, 0, 0]),
      chunk("d", [0, 1, 0]),
      chunk("e", [-1, 0, 0]),
    ];
    const top = topK(query, chunks, 3);
    expect(top.map((t) => t.chunk.id)).toEqual(["b", "c", "d"]);
    expect(top[0].score).toBeGreaterThan(top[1].score);
    expect(top[1].score).toBeGreaterThanOrEqual(top[2].score);
    expect(top.length).toBe(3);
  });
});
