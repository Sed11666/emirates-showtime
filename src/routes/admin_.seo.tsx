/**
 * Route "/admin/seo" — admin-only SEO health dashboard.
 *
 * Reads the snapshots written by /api/public/hooks/seo-audit: one run per
 * check, one row per landing page. Nothing is crawled on page load — the point
 * of storing runs is that history exists and the page is cheap.
 *
 * Gated twice: useIsAdmin hides the UI, RLS on both tables is the real
 * boundary. The route is noindex and stays out of the sitemap, like /admin.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { TIER_LABELS, type SeoTier } from "@/lib/seo-audit";

export const Route = createFileRoute("/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO health | ShowSouk admin" },
      {
        name: "description",
        content:
          "Internal dashboard tracking landing-page status codes, metadata, canonicals, structured data and sitemap coverage.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SeoHealthPage,
});

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  pages_checked: number;
  pages_failing: number;
  score: number;
  sitemap_url_count: number;
  notes: string | null;
};

type PageCheck = {
  path: string;
  tier: string;
  status_code: number | null;
  response_ms: number | null;
  title: string | null;
  title_len: number;
  description_len: number;
  canonical: string | null;
  canonical_ok: boolean;
  h1_count: number;
  jsonld_types: string[];
  in_sitemap: boolean;
  issues: string[];
};

const TIER_ORDER: string[] = ["home", "chain", "venue", "emirate", "language", "film", "legal", "other"];

function tierLabel(tier: string): string {
  return TIER_LABELS[tier as SeoTier] ?? "Unlisted";
}

function when(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SeoHealthPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [tier, setTier] = useState<string>("all");
  const [onlyIssues, setOnlyIssues] = useState(true);

  const runsQuery = useQuery({
    queryKey: ["seo-runs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_audit_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as Run[];
    },
  });

  const latest = runsQuery.data?.[0];

  const checksQuery = useQuery({
    queryKey: ["seo-checks", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_page_checks")
        .select("*")
        .eq("run_id", latest!.id)
        .order("path");
      if (error) throw new Error(error.message);
      return (data ?? []) as PageCheck[];
    },
  });

  const checks = useMemo(() => checksQuery.data ?? [], [checksQuery.data]);

  /** Problems grouped by kind, so a systemic fault reads as one line not forty. */
  const issueGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of checks) {
      for (const issue of c.issues) {
        // "3 H1 headings" and "5 H1 headings" are the same fault.
        const key = issue.replace(/^\d+\s/, "n ").replace(/HTTP \d+/, "a non-200 status");
        map.set(key, [...(map.get(key) ?? []), c.path]);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [checks]);

  const visible = useMemo(() => {
    let rows = checks;
    if (tier !== "all") rows = rows.filter((c) => c.tier === tier);
    if (onlyIssues) rows = rows.filter((c) => c.issues.length > 0);
    return rows;
  }, [checks, tier, onlyIssues]);

  const trend = useMemo(
    () =>
      [...(runsQuery.data ?? [])]
        .reverse()
        .map((r) => ({ at: when(r.started_at), score: r.score, failing: r.pages_failing })),
    [runsQuery.data],
  );

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/public/hooks/seo-audit?trigger=manual", { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; error?: string; pages_checked?: number };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "The check could not be completed");
      toast.success(`Checked ${body.pages_checked ?? 0} pages`);
      await queryClient.invalidateQueries({ queryKey: ["seo-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["seo-checks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The check could not be completed");
    } finally {
      setRunning(false);
    }
  }

  if (loading || roleLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Admins only</h1>
        <p className="mt-3 text-muted-foreground">
          The SEO health dashboard is restricted to ShowSouk staff.
        </p>
        <Button asChild variant="hero" className="mt-6">
          <Link to="/">Browse what's on</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SEO health</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every landing page, checked against the live site: status codes, titles and
            descriptions, canonicals, structured data and sitemap coverage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Listings</Link>
          </Button>
          <Button variant="hero" size="sm" onClick={runNow} disabled={running}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Run check now
          </Button>
        </div>
      </div>

      {!latest ? (
        <p className="mt-12 rounded-xl border border-border/60 bg-card/40 p-8 text-center text-muted-foreground">
          No checks recorded yet. Run one to take the first snapshot.
        </p>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Health score"
              value={`${latest.score}%`}
              tone={latest.score >= 95 ? "good" : latest.score >= 80 ? "warn" : "bad"}
            />
            <Stat label="Pages checked" value={String(latest.pages_checked)} />
            <Stat
              label="Pages with issues"
              value={String(latest.pages_failing)}
              tone={latest.pages_failing === 0 ? "good" : "warn"}
            />
            <Stat label="URLs in sitemap" value={String(latest.sitemap_url_count)} />
          </section>

          <p className="mt-3 text-xs text-muted-foreground">
            Last checked {when(latest.started_at)} (Dubai) · {latest.trigger === "manual" ? "manual run" : "scheduled run"}
            {latest.notes ? ` · ${latest.notes}` : ""}
          </p>

          {trend.length > 1 && (
            <section className="mt-8 rounded-xl border border-border/60 bg-card/40 p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Score and problem pages over time
              </h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="at" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      name="Score %"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="failing"
                      name="Pages with issues"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Problems found
            </h2>
            {issueGroups.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Every checked page passed.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {issueGroups.map(([issue, paths]) => (
                  <li
                    key={issue}
                    className="rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4 text-accent" />
                      {issue}
                      <Badge variant="secondary" className="ml-auto">
                        {paths.length} page{paths.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {paths.slice(0, 6).join(", ")}
                      {paths.length > 6 ? ` +${paths.length - 6} more` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pages
              </h2>
              <Button
                size="sm"
                variant={onlyIssues ? "hero" : "outline"}
                onClick={() => setOnlyIssues((v) => !v)}
              >
                {onlyIssues ? "Showing problems only" : "Showing all pages"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {["all", ...TIER_ORDER].map((key) => {
                const count =
                  key === "all" ? checks.length : checks.filter((c) => c.tier === key).length;
                if (count === 0 && key !== "all") return null;
                return (
                  <button
                    key={key}
                    onClick={() => setTier(key)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      tier === key
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border/60 text-muted-foreground hover:border-accent/50"
                    }`}
                  >
                    {key === "all" ? "All" : tierLabel(key)} ({count})
                  </button>
                );
              })}
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-card/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Page</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Desc</th>
                    <th className="px-3 py-2">Canonical</th>
                    <th className="px-3 py-2">Schema</th>
                    <th className="px-3 py-2">Sitemap</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.path} className="border-t border-border/40 align-top">
                      <td className="px-3 py-2">
                        <a
                          href={`https://www.showsouk.com${c.path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-accent"
                        >
                          {c.path}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                        <div className="text-xs text-muted-foreground">{tierLabel(c.tier)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={c.status_code === 200 ? "" : "text-destructive"}>
                          {c.status_code ?? "—"}
                        </span>
                        {c.response_ms != null && (
                          <div className="text-xs text-muted-foreground">{c.response_ms} ms</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{c.title_len || "—"}</td>
                      <td className="px-3 py-2">{c.description_len || "—"}</td>
                      <td className="px-3 py-2">{c.canonical_ok ? "Self" : c.canonical ? "Other" : "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.jsonld_types.length ? c.jsonld_types.join(", ") : "—"}
                      </td>
                      <td className="px-3 py-2">{c.in_sitemap ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.issues.length ? c.issues.join(" · ") : "OK"}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        Nothing to show with these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const colour =
    tone === "good"
      ? "text-primary"
      : tone === "warn"
        ? "text-accent"
        : tone === "bad"
          ? "text-destructive"
          : "";
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
    </div>
  );
}
