-- =============================================================================
-- ShowSouk — first-party marketing analytics (2026-11-26)
-- =============================================================================
-- Run once in Supabase -> SQL Editor, BEFORE deploying the code that calls
-- log_site_event (until then the site's calls fail quietly — nothing breaks,
-- but nothing is counted). Safe to re-run. Also folded into 01-schema.sql.
--
-- Why our own table: Vercel Web Analytics custom events need the Pro plan.
-- What it records, per browser tab session: one `visit` (where the visitor came
-- from: utm_source, else the referring site, else "direct") and every
-- `booking_tap` (film, chain, venue). Nothing personal: no IP, no user agent,
-- no account id — a random session id that dies with the tab, and a coarse
-- device class. Bots are filtered in the browser.
--
-- Readable only by admins, through marketing_report() and /admin/marketing.
-- =============================================================================

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('visit', 'booking_tap', 'share')),
  session_id text not null,
  path text,
  film text,
  cinema text,
  venue text,
  source text not null default 'direct',
  medium text,
  campaign text,
  device text
);
create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_session_idx on public.site_events (session_id, created_at desc);

alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;
grant select on public.site_events to authenticated;
grant all on public.site_events to service_role;
drop policy if exists "Admins can view site events" on public.site_events;
create policy "Admins can view site events"
  on public.site_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- The only write path. Validates and trims everything, keeps one visit per
-- session per 30 minutes, and caps any session at 60 events per 10 minutes so
-- a script cannot flood the table.
create or replace function public.log_site_event(p_event jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := p_event->>'kind';
  v_session text := lower(coalesce(p_event->>'session_id', ''));
  v_recent integer;
begin
  if v_kind not in ('visit', 'booking_tap', 'share') then return false; end if;
  if v_session !~ '^[a-z0-9-]{8,64}$' then return false; end if;

  select count(*) into v_recent
    from public.site_events
   where session_id = v_session
     and created_at > now() - interval '10 minutes';
  if v_recent >= 60 then return false; end if;

  if v_kind = 'visit' and exists (
    select 1 from public.site_events
     where session_id = v_session and kind = 'visit'
       and created_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;

  insert into public.site_events (kind, session_id, path, film, cinema, venue, source, medium, campaign, device)
  values (
    v_kind,
    v_session,
    left(nullif(p_event->>'path', ''), 200),
    left(nullif(p_event->>'film', ''), 120),
    left(nullif(p_event->>'cinema', ''), 40),
    left(nullif(p_event->>'venue', ''), 120),
    coalesce(left(nullif(lower(p_event->>'source'), ''), 60), 'direct'),
    left(nullif(lower(p_event->>'medium'), ''), 60),
    left(nullif(lower(p_event->>'campaign'), ''), 80),
    case when p_event->>'device' in ('mobile', 'desktop') then p_event->>'device' end
  );
  return true;
end;
$$;
revoke all on function public.log_site_event(jsonb) from public;
grant execute on function public.log_site_event(jsonb) to anon, authenticated, service_role;

-- Everything /admin/marketing shows, in one call. Admins only.
-- Days are Dubai days. "Tap rate" = sessions with at least one booking tap
-- divided by sessions — the number a marketing channel is judged on.
create or replace function public.marketing_report(p_days integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 28), 365)));
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 28), 365)),
    'totals', (
      select jsonb_build_object(
        'sessions', count(distinct session_id) filter (where kind = 'visit'),
        'taps', count(*) filter (where kind = 'booking_tap'),
        'tapping_sessions', count(distinct session_id) filter (where kind = 'booking_tap'),
        'shares', count(*) filter (where kind = 'share')
      )
      from public.site_events where created_at >= v_since
    ),
    'by_source', coalesce((
      select jsonb_agg(row_to_json(t) order by t.sessions desc, t.taps desc)
      from (
        select source,
               count(distinct session_id) filter (where kind = 'visit') as sessions,
               count(*) filter (where kind = 'booking_tap') as taps,
               count(distinct session_id) filter (where kind = 'booking_tap') as tapping_sessions
          from public.site_events
         where created_at >= v_since
         group by source
      ) t
    ), '[]'::jsonb),
    'by_campaign', coalesce((
      select jsonb_agg(row_to_json(t) order by t.sessions desc, t.taps desc)
      from (
        select campaign, source, medium,
               count(distinct session_id) filter (where kind = 'visit') as sessions,
               count(*) filter (where kind = 'booking_tap') as taps
          from public.site_events
         where created_at >= v_since and campaign is not null
         group by campaign, source, medium
      ) t
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(row_to_json(t) order by t.day)
      from (
        select to_char(created_at at time zone 'Asia/Dubai', 'YYYY-MM-DD') as day,
               count(distinct session_id) filter (where kind = 'visit') as sessions,
               count(*) filter (where kind = 'booking_tap') as taps
          from public.site_events
         where created_at >= v_since
         group by 1
      ) t
    ), '[]'::jsonb),
    'top_films', coalesce((
      select jsonb_agg(row_to_json(t) order by t.taps desc)
      from (
        select film, count(*) as taps, count(distinct session_id) as sessions
          from public.site_events
         where created_at >= v_since and kind = 'booking_tap' and film is not null
         group by film
         order by count(*) desc
         limit 15
      ) t
    ), '[]'::jsonb),
    'top_landing', coalesce((
      select jsonb_agg(row_to_json(t) order by t.sessions desc)
      from (
        select path, count(distinct session_id) as sessions
          from public.site_events
         where created_at >= v_since and kind = 'visit' and path is not null
         group by path
         order by count(distinct session_id) desc
         limit 15
      ) t
    ), '[]'::jsonb),
    'by_device', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select coalesce(device, 'unknown') as device,
               count(distinct session_id) filter (where kind = 'visit') as sessions,
               count(*) filter (where kind = 'booking_tap') as taps
          from public.site_events
         where created_at >= v_since
         group by 1
      ) t
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.marketing_report(integer) from public, anon;
grant execute on function public.marketing_report(integer) to authenticated, service_role;

-- Should list the new table.
select table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'site_events';
