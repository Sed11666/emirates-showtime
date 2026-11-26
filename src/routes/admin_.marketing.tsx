/**
 * Route "/admin/marketing" — admin-only channel report.
 *
 * Reads marketing_report() (supabase/setup/05-site-events.sql), which
 * aggregates the anonymous visit and booking-tap counts that
 * lib/attribution.ts records. The question it answers: which channel sends
 * people who go on to book? Sessions alone flatter whoever posts the most;
 * the tap rate is the number a channel is judged on.
 *
 * Gated twice: useIsAdmin hides the UI, and the function itself raises for
 * anyone who is not an admin. noindex and out of the sitemap, like /admin.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/admin_/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing | ShowSouk admin" },
      {
        name: "description",
        content: "Internal report of visits and booking taps by traffic source and campaign.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MarketingPage,
});

type SourceRow = { source: string; sessions: number; taps: number; tapping_sessions: number };
type CampaignRow = { campaign: string; source: string; medium: string | null; sessions: number; taps: number };
type Report = {
  days: number;
  totals: { sessions: number; taps: number; tapping_sessions: number; shares: number };
  by_source: SourceRow[];
  by_campaign: CampaignRow[];
  by_day: { day: string; sessions: number; taps: number }[];
  top_films: { film: string; taps: number; sessions: number }[];
  top_landing: { path: string; sessions: number }[];
  by_device: { device: string; sessions: number; taps: number }[];
};

const RANGES = [7, 28, 90] as const;

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function MarketingPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [days, setDays] = useState<number>(28);

  const report = useQuery({
    queryKey: ["marketing-report", days],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_report", { p_days: days });
      if (error) throw new Error(error.message);
      return data as unknown as Report;
    },
  });

  if (loading || roleLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Admins only</h1>
        <p className="mt-3 text-muted-foreground">
          The marketing report is restricted to ShowSouk staff.
        </p>
        <Button asChild variant="hero" className="mt-6">
          <Link to="/">Browse what's on</Link>
        </Button>
      </main>
    );
  }

  const r = report.data;
  const maxDay = Math.max(1, ...(r?.by_day ?? []).map((d) => d.sessions));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Visits and booking taps by where people came from. Anonymous, production only,
            bots skipped. Tag every link you post with{" "}
            <code className="rounded bg-muted px-1 text-xs">?utm_source=instagram&amp;utm_campaign=…</code>{" "}
            so it is credited correctly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === days ? "hero" : "outline"}
              onClick={() => setDays(d)}
            >
              {d} days
            </Button>
          ))}
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/seo">SEO</Link>
          </Button>
        </div>
      </div>

      {report.isLoading ? (
        <p className="mt-12 text-muted-foreground">Loading…</p>
      ) : report.error ? (
        <p className="mt-12 rounded-xl border border-border/60 bg-card/40 p-8 text-center text-muted-foreground">
          The report could not load: {(report.error as Error).message}
        </p>
      ) : !r || r.totals.sessions === 0 ? (
        <p className="mt-12 rounded-xl border border-border/60 bg-card/40 p-8 text-center text-muted-foreground">
          No visits recorded in this period yet. Counting starts once the site is live with tracking.
        </p>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visits (sessions)" value={r.totals.sessions.toLocaleString()} />
            <Stat label="Booking taps" value={r.totals.taps.toLocaleString()} />
            <Stat label="Sessions that tapped" value={r.totals.tapping_sessions.toLocaleString()} />
            <Stat label="Tap rate" value={pct(r.totals.tapping_sessions, r.totals.sessions)} />
          </section>

          <Section title="By source">
            <Table
              head={["Source", "Visits", "Taps", "Tap rate"]}
              rows={r.by_source.map((s) => [
                s.source,
                s.sessions,
                s.taps,
                pct(s.tapping_sessions, s.sessions),
              ])}
            />
          </Section>

          {r.by_campaign.length > 0 && (
            <Section title="By campaign (utm_campaign)">
              <Table
                head={["Campaign", "Source", "Medium", "Visits", "Taps"]}
                rows={r.by_campaign.map((c) => [c.campaign, c.source, c.medium ?? "—", c.sessions, c.taps])}
              />
            </Section>
          )}

          <Section title="Per day (Dubai)">
            <div className="space-y-1.5">
              {r.by_day.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{d.day}</span>
                  <div className="h-2.5 flex-1 rounded bg-muted/40">
                    <div
                      className="h-2.5 rounded bg-primary"
                      style={{ width: `${(d.sessions / maxDay) * 100}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums">
                    {d.sessions} · {d.taps} taps
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Most-tapped films">
              <Table
                head={["Film", "Taps", "Sessions"]}
                rows={r.top_films.map((f) => [f.film, f.taps, f.sessions])}
                empty="No booking taps yet."
              />
            </Section>
            <Section title="Landing pages">
              <Table
                head={["Page", "Visits"]}
                rows={r.top_landing.map((p) => [p.path, p.sessions])}
              />
            </Section>
          </div>

          <Section title="Device">
            <Table
              head={["Device", "Visits", "Taps"]}
              rows={r.by_device.map((d) => [d.device, d.sessions, d.taps])}
            />
          </Section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-border/60 bg-card/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  empty = "Nothing yet.",
}: {
  head: string[];
  rows: (string | number)[][];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-border/40">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-1.5 ${ci > 0 ? "text-right tabular-nums" : "max-w-[18rem] truncate"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
