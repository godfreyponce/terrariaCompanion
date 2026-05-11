"use client";
import type { QueryItem } from "@/types";

function slugFromName(name: string): string {
  return name.replace(/\s+/g, "_");
}

export function ResponseCard({ item }: { item: QueryItem }) {
  const href = `https://terraria.wiki.gg/wiki/${encodeURIComponent(slugFromName(item.name))}`;
  return (
    <article className="flex gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex-none w-16 h-16 rounded bg-[var(--color-card-warm)] flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="max-w-full max-h-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-base font-medium text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
        >
          {item.name}
          <span aria-hidden className="ml-1 text-xs text-[var(--color-text-mute)]">↗</span>
        </a>
        <p className="mt-1 text-sm text-[var(--color-text-dim)] leading-snug">
          {item.why_it_matters}
        </p>
      </div>
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-3 animate-pulse">
      <div className="flex-none w-16 h-16 rounded bg-[var(--color-card-warm)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-1/3 rounded bg-[var(--color-card-warm)]" />
        <div className="h-3 w-full rounded bg-[var(--color-card-warm)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--color-card-warm)]" />
      </div>
    </div>
  );
}
