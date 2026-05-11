import { NextResponse } from "next/server";
import path from "node:path";
import { readProgression, writeProgression, mergeProgression } from "@/lib/progression";
import { loadEnvFile } from "@/lib/env-loader";
import type { Progression } from "@/types";

loadEnvFile(path.resolve(".env.local"));

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const p = await readProgression();
  return NextResponse.json(p);
}

export async function PATCH(req: Request): Promise<Response> {
  let patch: Partial<Progression>;
  try {
    patch = (await req.json()) as Partial<Progression>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "patch must be an object" }, { status: 400 });
  }
  const current = await readProgression();
  const next = mergeProgression(current, patch);
  await writeProgression(next);
  return NextResponse.json(next);
}
