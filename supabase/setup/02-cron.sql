-- =============================================================================
-- ShowSouk — scheduled jobs (run AFTER Vercel points at this database)
-- =============================================================================
-- Safe to re-run: cron.schedule with an existing name replaces that job.
-- Schedules are UTC (CLAUDE-HANDOVER §5). The odd minutes keep each job clear
-- of the aggregator's :00/:30 slots.
--
-- Not scheduled: scrape-events. That route needs LOVABLE_API_KEY and
-- FIRECRAWL_API_KEY plus the service-role key, none of which exist on Vercel,
-- and the Events page is a "Coming Soon" placeholder anyway.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cinemas: every 30 minutes, plain POST, NO query string — the route paces
-- itself from the clock (CLAUDE-HANDOVER §4). This interval MUST equal
-- PACE_WINDOW_MS in scrape-aggregator.ts (30 * 60 * 1000), or pages are skipped.
-- 10 pages per run x ~86 pages = a full refresh roughly every 4.5 hours.
select cron.schedule(
  'scrape-aggregator-30m',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://www.showsouk.com/api/public/hooks/scrape-aggregator',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- TMDB posters, backdrops, ratings and cast: daily 04:17 UTC (08:17 Dubai).
select cron.schedule(
  'resolve-posters-daily',
  '17 4 * * *',
  $$
  select net.http_post(
    url := 'https://www.showsouk.com/api/public/hooks/resolve-posters',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Coverage check (us vs the source), emailed: every 5 hours at :37.
select cron.schedule(
  'coverage-check-5h',
  '37 */5 * * *',
  $$
  select net.http_post(
    url := 'https://www.showsouk.com/api/public/hooks/coverage-check',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- SEO health dashboard: daily 02:47 UTC (06:47 Dubai).
select cron.schedule(
  'seo-audit-daily',
  '47 2 * * *',
  $$
  select net.http_post(
    url := 'https://www.showsouk.com/api/public/hooks/seo-audit',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Should list the four jobs, all active.
select jobid, jobname, schedule, active from cron.job order by jobname;
