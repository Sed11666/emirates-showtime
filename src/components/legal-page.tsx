/**
 * legal-page.tsx — shared shell for /privacy and /terms.
 *
 * Extracted rather than copied. Two pages with the same hand-rolled headings
 * drift, and this codebase has paid for that three times already — the
 * showtime chip, the filter dropdown and the theme menu were all duplicated
 * before they were shared. A legal page is a worse place than most for two
 * versions of the same layout to disagree.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      {children}
      <p className="mt-12 text-sm">
        <Link to="/" className="text-gold hover:brightness-125">
          &larr; Back to ShowSouk
        </Link>
      </p>
    </main>
  );
}

/** The pull-out box at the top: the two or three things that actually matter. */
export function KeyPoints({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-8 rounded-xl border border-gold/40 bg-gold/5 p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</ul>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list, styled once so the two pages cannot diverge on it. */
export function Points({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-1">{children}</ul>;
}

/** Emphasis inside body copy — muted paragraphs, so this lifts to foreground. */
export function Lead({ children }: { children: ReactNode }) {
  return <strong className="text-foreground">{children}</strong>;
}
