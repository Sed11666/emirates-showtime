/**
 * Route "/events" — intentionally a "Events Coming Soon" placeholder for this
 * release (liquid-glass blurred backdrop + gold accents). The scraper
 * (api/public/hooks/scrape-events) and lib/live-events.ts still run and feed
 * search, so restoring the full listing UI here is a presentation-only change.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events Coming Soon | ShowSouk" },
      {
        name: "description",
        content: "Live concerts, comedy, sports and arena experiences are on their way to ShowSouk.",
      },
      { property: "og:title", content: "Events Coming Soon | ShowSouk" },
      {
        property: "og:description",
        content: "Live concerts, comedy, sports and arena experiences are on their way to ShowSouk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsComingSoon,
});

function EventsComingSoon() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4">
      {/* Blurry liquid glass backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-background via-background to-[oklch(0.16_0.02_280)]" />
      <div
        className="pointer-events-none absolute -left-1/4 -top-1/4 -z-10 h-[70vw] w-[70vw] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle, oklch(0.38 0.085 165 / 0.5) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-1/4 -right-1/4 -z-10 h-[60vw] w-[60vw] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(circle, oklch(0.79 0.12 88 / 0.4) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[50vw] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-[140px]"
        style={{ background: "radial-gradient(circle, oklch(0.53 0.108 165 / 0.35) 0%, transparent 70%)" }}
      />

      {/* Liquid glass card */}
      <div className="relative w-full max-w-lg text-center">
        <div className="absolute inset-0 -z-10 rounded-3xl border border-border/40 bg-white/[0.03] backdrop-blur-2xl" />
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-gold/10 opacity-60" />
        <div className="px-8 py-14 sm:px-12 sm:py-20">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold shadow-glow">
            <Sparkles className="size-8" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Events Coming Soon
          </h1>
          <p className="mx-auto mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground sm:max-w-sm">
            Live concerts, comedy, sports and arena experiences are on their way. We are putting the
            finishing touches on the UAE&apos;s best events guide.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            <span className="text-xs uppercase tracking-widest text-gold/90">Stay tuned</span>
          </div>
        </div>
      </div>
    </main>
  );
}
