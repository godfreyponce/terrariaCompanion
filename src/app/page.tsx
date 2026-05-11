"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parse as partialParse, Allow } from "partial-json";
import { QueryBar } from "@/components/QueryBar";
import { ResponseCard, SkeletonCard } from "@/components/ResponseCard";
import { WarningsPanel } from "@/components/WarningsPanel";
import { NextSteps } from "@/components/NextSteps";
import { ProgressionPanel } from "@/components/ProgressionPanel";
import type { Progression, QueryItem, QueryResponse } from "@/types";

const EMPTY_RESPONSE: QueryResponse = { items: [], next_steps: [], warnings: [] };

function isInputTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function filterPartial(
  partial: unknown,
  allowedUrls: Set<string>,
): QueryResponse {
  if (!partial || typeof partial !== "object") return EMPTY_RESPONSE;
  const p = partial as Partial<QueryResponse>;
  const items: QueryItem[] = Array.isArray(p.items)
    ? p.items
        .map((raw): QueryItem | null => {
          if (!raw || typeof raw !== "object") return null;
          const it = raw as Partial<QueryItem>;
          if (!it.name || typeof it.name !== "string") return null;
          const url = typeof it.image_url === "string" ? it.image_url : "";
          return {
            name: it.name,
            image_url: url && allowedUrls.has(url) ? url : "",
            why_it_matters: typeof it.why_it_matters === "string" ? it.why_it_matters : "",
          };
        })
        .filter((x): x is QueryItem => x !== null)
    : [];
  const next_steps = Array.isArray(p.next_steps)
    ? p.next_steps.filter((s): s is string => typeof s === "string")
    : [];
  const warnings = Array.isArray(p.warnings)
    ? p.warnings.filter((s): s is string => typeof s === "string")
    : [];
  return { items, next_steps, warnings };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json() as Promise<Progression>)
      .then(setProgression)
      .catch(() => setProgression(null));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !isInputTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "p" && !isInputTarget(e.target)) {
        e.preventDefault();
        setProgressionOpen((v) => !v);
      } else if (e.key === "Escape") {
        setResponse(null);
        setSubmittedQuery(null);
        setError(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateProgression = useCallback(async (patch: Partial<Progression>) => {
    const res = await fetch("/api/state", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const next = (await res.json()) as Progression;
      setProgression(next);
    }
  }, []);

  const submit = useCallback(
    async (query: string) => {
      if (!progression) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreaming(true);
      setError(null);
      setResponse(null);
      setSubmittedQuery(query);

      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, progression }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          setError(text || `HTTP ${res.status}`);
          setStreaming(false);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setError("no response stream");
          setStreaming(false);
          return;
        }
        const decoder = new TextDecoder();
        let raw = "";
        let phase: "heartbeat" | "meta" | "llm" = "heartbeat";
        let allowed = new Set<string>();
        let llmStart = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });

          if (phase === "heartbeat") {
            const nl = raw.indexOf("\n");
            if (nl !== -1) {
              phase = "meta";
              llmStart = nl + 1;
            }
          }
          if (phase === "meta") {
            const nl = raw.indexOf("\n", llmStart);
            if (nl !== -1) {
              const metaLine = raw.slice(llmStart, nl);
              try {
                const meta = JSON.parse(metaLine) as { allowed_image_urls?: string[] };
                allowed = new Set(meta.allowed_image_urls ?? []);
              } catch {
                /* tolerate malformed meta */
              }
              llmStart = nl + 1;
              phase = "llm";
            }
          }
          if (phase === "llm") {
            const llmBuf = raw.slice(llmStart);
            if (llmBuf.length > 0) {
              try {
                const partial = partialParse(llmBuf, Allow.ALL);
                setResponse(filterPartial(partial, allowed));
              } catch {
                // partial-json throws on unparseable prefixes; ignore and wait
              }
            }
          }
        }
        raw += decoder.decode();
        if (phase === "llm") {
          const llmBuf = raw.slice(llmStart);
          try {
            const final = JSON.parse(llmBuf);
            setResponse(filterPartial(final, allowed));
          } catch {
            // keep last successful partial
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [progression],
  );

  const hasResult = response !== null;
  const hasItems = hasResult && response.items.length > 0;
  const hasWarnings = hasResult && response.warnings.length > 0;
  const hasNextSteps = hasResult && response.next_steps.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-lg font-medium tracking-tight">
          <span className="text-[var(--color-accent)]">🧙</span>{" "}
          <span className="text-[var(--color-text)]">mage companion</span>
        </h1>
        {progression ? (
          <ProgressionPanel
            progression={progression}
            expanded={progressionOpen}
            onToggle={() => setProgressionOpen((v) => !v)}
            onChange={updateProgression}
          />
        ) : (
          <div className="text-xs text-[var(--color-text-mute)]">loading state…</div>
        )}
      </header>

      <QueryBar ref={inputRef} onSubmit={submit} disabled={streaming || !progression} />

      <section className="space-y-3" aria-live="polite" aria-busy={streaming}>
        {error ? (
          <div className="rounded-md border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn-text)]">
            {error}
          </div>
        ) : null}

        {streaming && !hasResult ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : null}

        {hasResult ? (
          <>
            {hasWarnings ? <WarningsPanel warnings={response.warnings} /> : null}
            {hasItems ? (
              <div className="space-y-3">
                {response.items.slice(0, 3).map((item, i) => (
                  <ResponseCard key={`${item.name}-${i}`} item={item} />
                ))}
              </div>
            ) : null}
            {hasNextSteps ? <NextSteps steps={response.next_steps} /> : null}
            {!hasItems && !hasWarnings && !hasNextSteps && !streaming ? (
              <p className="text-sm text-[var(--color-text-mute)]">empty response</p>
            ) : null}
          </>
        ) : null}
      </section>

      {!submittedQuery && !streaming ? (
        <footer className="text-xs text-[var(--color-text-mute)] pt-4 border-t border-[var(--color-border)]">
          <span className="mr-3">
            <kbd className="rounded bg-[var(--color-card-warm)] px-1.5 py-0.5">/</kbd> focus
          </span>
          <span className="mr-3">
            <kbd className="rounded bg-[var(--color-card-warm)] px-1.5 py-0.5">Esc</kbd> clear
          </span>
          <span className="mr-3">
            <kbd className="rounded bg-[var(--color-card-warm)] px-1.5 py-0.5">p</kbd> progression
          </span>
          <span>
            <kbd className="rounded bg-[var(--color-card-warm)] px-1.5 py-0.5">Enter</kbd> submit
          </span>
        </footer>
      ) : null}
    </main>
  );
}
