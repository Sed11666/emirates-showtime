-- =============================================================================
-- ShowSouk — full database setup for a fresh Supabase project
-- =============================================================================
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run: everything is CREATE ... IF NOT EXISTS / CREATE OR REPLACE.
--
-- Rebuilt 2026-11-18 when the Lovable Cloud database was paused (out of
-- credits) and could not be exported. Tables come from supabase/migrations and
-- src/integrations/supabase/types.ts. The six scraper functions never existed
-- in the repo (CLAUDE-HANDOVER §11.10); they are rewritten here from the
-- behaviour documented in CLAUDE-HANDOVER §4, §5 and §8, and their call sites.
--
-- Deliberately NOT included:
--   * the sample listings seeded by the first Lovable migration (fake data)
--   * cron jobs — those are 02-cron.sql, run only after Vercel points here
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create type public.listing_kind as enum ('movie', 'event');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Roles and admin
-- -----------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
drop policy if exists "Users can view their own roles" on public.user_roles;
create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

create table if not exists public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
grant select on public.admin_allowlist to authenticated;
grant all on public.admin_allowlist to service_role;
drop policy if exists "Admins can view allowlist" on public.admin_allowlist;
create policy "Admins can view allowlist"
  on public.admin_allowlist for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

insert into public.admin_allowlist (email) values ('syedebaad609@gmail.com')
on conflict (email) do nothing;

-- Called by useIsAdmin after sign-in. Grants admin only to a verified email on
-- the allowlist.
create or replace function public.claim_admin_role()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_verified boolean;
begin
  select lower(u.email), (u.email_confirmed_at is not null)
    into v_email, v_verified
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or not coalesce(v_verified, false) then
    return false;
  end if;

  if not exists (select 1 from public.admin_allowlist a where lower(a.email) = v_email) then
    return false;
  end if;

  insert into public.user_roles (user_id, role)
  values (auth.uid(), 'admin')
  on conflict (user_id, role) do nothing;

  return true;
end;
$$;
revoke all on function public.claim_admin_role() from public, anon;
grant execute on function public.claim_admin_role() to authenticated;

-- -----------------------------------------------------------------------------
-- Curated listings (/admin)
-- -----------------------------------------------------------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  kind public.listing_kind not null default 'movie',
  title text not null,
  description text,
  poster_url text,
  genre text,
  language text,
  venue text,
  city text not null default 'Dubai',
  price_aed numeric(10,2) not null default 0,
  starts_at timestamptz,
  duration_mins integer,
  certification text,
  featured boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.listings enable row level security;
grant select on public.listings to anon;
grant select, insert, update, delete on public.listings to authenticated;
grant all on public.listings to service_role;
drop policy if exists "Listings are publicly viewable" on public.listings;
create policy "Listings are publicly viewable"
  on public.listings for select using (true);
drop policy if exists "Admins can create listings" on public.listings;
create policy "Admins can create listings"
  on public.listings for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins can update listings" on public.listings;
create policy "Admins can update listings"
  on public.listings for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins can delete listings" on public.listings;
create policy "Admins can delete listings"
  on public.listings for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop trigger if exists update_listings_updated_at on public.listings;
create trigger update_listings_updated_at
  before update on public.listings
  for each row execute function public.update_updated_at_column();
create index if not exists listings_kind_idx on public.listings (kind);
create index if not exists listings_city_idx on public.listings (city);

-- -----------------------------------------------------------------------------
-- Scraped cinema catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.cinema_films (
  id uuid primary key default gen_random_uuid(),
  cinema text not null,
  title text not null,
  title_key text not null,
  city text not null default '',
  venues text[] not null default '{}',
  genre text,
  language text,
  rating text,
  duration_mins integer,
  poster_url text,
  backdrop_url text,
  synopsis text,
  imdb_id text,
  director text,
  cast_names text[],
  cast_credits jsonb,
  tmdb_genres text[],
  imdb_rating numeric,
  imdb_votes integer,
  rt_score integer,
  metascore integer,
  formats text[] not null default '{}',
  showtimes jsonb not null default '[]'::jsonb,
  booking_url text,
  source_url text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cinema_films_cinema_title_key_city_key unique (cinema, title_key, city)
);
alter table public.cinema_films enable row level security;
grant select on public.cinema_films to anon, authenticated;
grant all on public.cinema_films to service_role;
-- The publishable key can never see a retired row (CLAUDE-HANDOVER gotcha 17).
drop policy if exists "Active cinema films are publicly viewable" on public.cinema_films;
create policy "Active cinema films are publicly viewable"
  on public.cinema_films for select
  using (is_active = true);
drop trigger if exists update_cinema_films_updated_at on public.cinema_films;
create trigger update_cinema_films_updated_at
  before update on public.cinema_films
  for each row execute function public.update_updated_at_column();
create index if not exists cinema_films_cinema_idx on public.cinema_films (cinema);
create index if not exists cinema_films_city_idx on public.cinema_films (city);
create index if not exists cinema_films_active_idx on public.cinema_films (is_active);
create index if not exists cinema_films_imdb_idx on public.cinema_films (imdb_id);

create table if not exists public.cinema_scrape_runs (
  id uuid primary key default gen_random_uuid(),
  cinema text not null,
  source_url text,
  content_hash text,
  changed boolean not null default false,
  films_upserted integer not null default 0,
  films_deactivated integer not null default 0,
  status text not null default 'success',
  error text,
  created_at timestamptz not null default now()
);
alter table public.cinema_scrape_runs enable row level security;
grant select on public.cinema_scrape_runs to authenticated;
grant all on public.cinema_scrape_runs to service_role;
drop policy if exists "Admins can view cinema scrape runs" on public.cinema_scrape_runs;
create policy "Admins can view cinema scrape runs"
  on public.cinema_scrape_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create index if not exists cinema_scrape_runs_cinema_idx
  on public.cinema_scrape_runs (cinema, created_at desc);

-- -----------------------------------------------------------------------------
-- Arena events
-- -----------------------------------------------------------------------------
create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  title_key text not null,
  city text,
  venue text,
  category text,
  date_text text,
  starts_on date,
  ends_on date,
  image_url text,
  description text,
  price_text text,
  ticket_url text,
  source_url text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, title_key)
);
alter table public.live_events enable row level security;
grant select on public.live_events to anon, authenticated;
grant all on public.live_events to service_role;
drop policy if exists "Active live events are publicly viewable" on public.live_events;
create policy "Active live events are publicly viewable"
  on public.live_events for select
  using (is_active = true);
drop trigger if exists update_live_events_updated_at on public.live_events;
create trigger update_live_events_updated_at
  before update on public.live_events
  for each row execute function public.update_updated_at_column();

create table if not exists public.event_scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text,
  content_hash text,
  changed boolean not null default false,
  events_upserted integer not null default 0,
  events_deactivated integer not null default 0,
  status text not null default 'success',
  error text,
  created_at timestamptz not null default now()
);
alter table public.event_scrape_runs enable row level security;
grant select on public.event_scrape_runs to authenticated;
grant all on public.event_scrape_runs to service_role;
drop policy if exists "Admins can view event scrape runs" on public.event_scrape_runs;
create policy "Admins can view event scrape runs"
  on public.event_scrape_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- Notify Me (one row per signed-in user; no cross-row reads)
-- -----------------------------------------------------------------------------
create table if not exists public.notify_subscribers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.notify_subscribers enable row level security;
grant select, insert, update, delete on public.notify_subscribers to authenticated;
grant all on public.notify_subscribers to service_role;
drop policy if exists "Users can view their own subscription" on public.notify_subscribers;
create policy "Users can view their own subscription"
  on public.notify_subscribers for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can subscribe themselves" on public.notify_subscribers;
create policy "Users can subscribe themselves"
  on public.notify_subscribers for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own subscription" on public.notify_subscribers;
create policy "Users can update their own subscription"
  on public.notify_subscribers for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can unsubscribe themselves" on public.notify_subscribers;
create policy "Users can unsubscribe themselves"
  on public.notify_subscribers for delete to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Scraper plumbing. RLS on with NO policies: only SECURITY DEFINER functions
-- (and service_role) can touch these.
-- -----------------------------------------------------------------------------
create table if not exists public.scraper_auth (
  id integer primary key default 1,
  token text not null,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.scraper_auth enable row level security;
revoke all on public.scraper_auth from anon, authenticated;
grant all on public.scraper_auth to service_role;

-- A fresh random ingest token. Read it once with:
--   select token from public.scraper_auth;
-- and put it in Vercel as SCRAPER_INGEST_TOKEN.
insert into public.scraper_auth (id, token, note)
values (1, encode(extensions.gen_random_bytes(32), 'hex'), 'Vercel SCRAPER_INGEST_TOKEN')
on conflict (id) do nothing;

-- The scraper's progress cursor since 2026-11-19 (scraper_cursor_get /
-- scraper_cursor_advance below). It was inert while the scraper paced itself
-- from the clock, which starved the tail of busy slices.
create table if not exists public.scraper_cursor (
  id integer primary key default 1,
  pos integer not null default 0,
  step integer not null default 0,
  total integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.scraper_cursor enable row level security;
revoke all on public.scraper_cursor from anon, authenticated;
grant all on public.scraper_cursor to service_role;

create table if not exists public.scraper_page_cache (
  url text primary key,
  etag text,
  last_modified text,
  content_hash text,
  film_keys text[] not null default '{}',
  hit_count integer not null default 0,
  fetched_at timestamptz not null default now()
);
alter table public.scraper_page_cache enable row level security;
revoke all on public.scraper_page_cache from anon, authenticated;
grant all on public.scraper_page_cache to service_role;

create or replace function public.scraper_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_token is not null
     and exists (select 1 from public.scraper_auth where token = p_token)
$$;
revoke all on function public.scraper_token_ok(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- retire_stale_films — deactivate films untouched for 48h, capped at 30% of
-- each chain's active rows per call (CLAUDE-HANDOVER gotcha 1).
-- NOT callable from the API at all: only ingest_cinema_films calls it, as the
-- function owner. This closes the hole recorded in CLAUDE-HANDOVER §11.2.
-- -----------------------------------------------------------------------------
create or replace function public.retire_stale_films(p_chains text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chain text;
  v_active integer;
  v_cap integer;
  v_done integer;
  v_total integer := 0;
begin
  foreach v_chain in array coalesce(p_chains, '{}'::text[]) loop
    select count(*) into v_active
      from public.cinema_films
     where cinema = v_chain and is_active;

    v_cap := floor(v_active * 0.30);
    continue when v_cap < 1;

    with stale as (
      select id
        from public.cinema_films
       where cinema = v_chain
         and is_active
         and last_seen_at < now() - interval '48 hours'
       order by last_seen_at asc
       limit v_cap
    )
    update public.cinema_films f
       set is_active = false
      from stale
     where f.id = stale.id;

    get diagnostics v_done = row_count;
    v_total := v_total + v_done;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.retire_stale_films(text[]) from public, anon, authenticated;
grant execute on function public.retire_stale_films(text[]) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_cinema_films — the only write path for scraped films.
--   * REPLACES showtimes / venues / formats (the scraper writes a page
--     all-or-nothing, CLAUDE-HANDOVER §4)
--   * strips cinemauae / aptrixx booking links (gotcha 6)
--   * coalesces metadata so a thin page cannot blank good values
--   * never overwrites TMDB artwork with a hotlinked poster
--   * then retires stale rows for the chains it touched
-- Every key the scraper sends is listed explicitly (gotcha 11).
-- -----------------------------------------------------------------------------
create or replace function public.ingest_cinema_films(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upserted integer := 0;
  v_retired integer := 0;
  v_chains text[];
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('upserted', 0, 'retired', 0);
  end if;

  with src as (
    select r
      from jsonb_array_elements(p_rows) as r
     where coalesce(r->>'cinema', '') <> ''
       and coalesce(r->>'title_key', '') <> ''
       and coalesce(r->>'title', '') <> ''
  ),
  clean as (
    select
      r->>'cinema'                                       as cinema,
      r->>'title'                                        as title,
      r->>'title_key'                                    as title_key,
      coalesce(r->>'city', '')                           as city,
      coalesce(array(select jsonb_array_elements_text(
        case when jsonb_typeof(r->'venues') = 'array' then r->'venues' else '[]' end)), '{}') as venues,
      coalesce(array(select jsonb_array_elements_text(
        case when jsonb_typeof(r->'formats') = 'array' then r->'formats' else '[]' end)), '{}') as formats,
      coalesce((
        select jsonb_agg(
                 case
                   when coalesce(s->>'booking_url', '') ~* '(cinemauae|aptrixx)'
                     then s - 'booking_url'
                   else s
                 end)
          from jsonb_array_elements(
                 case when jsonb_typeof(r->'showtimes') = 'array' then r->'showtimes' else '[]' end) as s
      ), '[]'::jsonb)                                    as showtimes,
      nullif(case when r->>'booking_url' ~* '(cinemauae|aptrixx)' then null else r->>'booking_url' end, '') as booking_url,
      nullif(case when r->>'source_url'  ~* '(cinemauae|aptrixx)' then null else r->>'source_url'  end, '') as source_url,
      nullif(r->>'poster_url', '')                       as poster_url,
      nullif(r->>'imdb_id', '')                          as imdb_id,
      nullif(r->>'genre', '')                            as genre,
      nullif(r->>'language', '')                         as language,
      nullif(r->>'rating', '')                           as rating,
      case when (r->>'duration_mins') ~ '^\d+$' then (r->>'duration_mins')::int end as duration_mins,
      nullif(r->>'synopsis', '')                         as synopsis,
      nullif(r->>'director', '')                         as director,
      case when jsonb_typeof(r->'cast_names') = 'array' and jsonb_array_length(r->'cast_names') > 0
           then array(select jsonb_array_elements_text(r->'cast_names')) end as cast_names
    from src
  ),
  -- One row per conflict key, or the upsert fails with "affect row a second time".
  dedup as (
    select distinct on (cinema, title_key, city) *
      from clean
     order by cinema, title_key, city
  ),
  up as (
    insert into public.cinema_films as f (
      cinema, title, title_key, city, venues, formats, showtimes,
      booking_url, source_url, poster_url, imdb_id, genre, language, rating,
      duration_mins, synopsis, director, cast_names,
      is_active, last_seen_at
    )
    select
      cinema, title, title_key, city, venues, formats, showtimes,
      booking_url, source_url, poster_url, imdb_id, genre, language, rating,
      duration_mins, synopsis, director, cast_names,
      true, now()
    from dedup
    on conflict (cinema, title_key, city) do update set
      title         = excluded.title,
      venues        = excluded.venues,
      formats       = excluded.formats,
      showtimes     = excluded.showtimes,
      booking_url   = coalesce(excluded.booking_url, f.booking_url),
      source_url    = coalesce(excluded.source_url, f.source_url),
      poster_url    = case
                        when f.poster_url like 'https://image.tmdb.org/%' then f.poster_url
                        else coalesce(excluded.poster_url, f.poster_url)
                      end,
      imdb_id       = coalesce(excluded.imdb_id, f.imdb_id),
      genre         = coalesce(excluded.genre, f.genre),
      language      = coalesce(excluded.language, f.language),
      rating        = coalesce(excluded.rating, f.rating),
      duration_mins = coalesce(excluded.duration_mins, f.duration_mins),
      synopsis      = coalesce(excluded.synopsis, f.synopsis),
      director      = coalesce(excluded.director, f.director),
      cast_names    = coalesce(excluded.cast_names, f.cast_names),
      is_active     = true,
      last_seen_at  = now()
    returning f.cinema
  )
  select count(*)::int, array_agg(distinct cinema)
    into v_upserted, v_chains
    from up;

  v_retired := public.retire_stale_films(coalesce(v_chains, '{}'::text[]));

  return jsonb_build_object('upserted', v_upserted, 'retired', v_retired, 'chains', to_jsonb(v_chains));
end;
$$;
revoke all on function public.ingest_cinema_films(text, jsonb) from public;
grant execute on function public.ingest_cinema_films(text, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- touch_films — refresh last_seen_at for films on an unchanged page, so
-- skipping the write never looks like the film stopped showing (gotcha 2).
-- p_keys: ["cinema|title_key|city", ...]
-- -----------------------------------------------------------------------------
create or replace function public.touch_films(p_token text, p_keys jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_touched integer := 0;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' then
    return jsonb_build_object('touched', 0);
  end if;

  update public.cinema_films f
     set last_seen_at = now()
    from (
      select split_part(k, '|', 1) as cinema,
             split_part(k, '|', 2) as title_key,
             split_part(k, '|', 3) as city
        from jsonb_array_elements_text(p_keys) as k
    ) as keys
   where f.cinema = keys.cinema
     and f.title_key = keys.title_key
     and f.city = keys.city
     and f.is_active;

  get diagnostics v_touched = row_count;
  return jsonb_build_object('touched', v_touched);
end;
$$;
revoke all on function public.touch_films(text, jsonb) from public;
grant execute on function public.touch_films(text, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- page_cache_get / page_cache_put
-- An "unchanged" put only bumps hit_count. It must NOT move fetched_at, so an
-- entry always expires at the end of the Dubai day it was written (gotcha 3),
-- and it must not drop the stored film_keys (gotcha 2).
-- -----------------------------------------------------------------------------
create or replace function public.page_cache_get(p_token text, p_urls text[])
returns table (
  url text,
  etag text,
  last_modified text,
  content_hash text,
  film_keys text[],
  fetched_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return query
    select c.url, c.etag, c.last_modified, c.content_hash, c.film_keys, c.fetched_at
      from public.scraper_page_cache c
     where c.url = any (coalesce(p_urls, '{}'::text[]));
end;
$$;
revoke all on function public.page_cache_get(text, text[]) from public;
grant execute on function public.page_cache_get(text, text[]) to anon, authenticated, service_role;

create or replace function public.page_cache_put(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written integer := 0;
  v_hits integer := 0;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('written', 0, 'hits', 0);
  end if;

  update public.scraper_page_cache c
     set hit_count = c.hit_count + 1
    from (
      select distinct r->>'url' as url
        from jsonb_array_elements(p_rows) as r
       where coalesce((r->>'unchanged')::boolean, false)
         and coalesce(r->>'url', '') <> ''
    ) as u
   where c.url = u.url;
  get diagnostics v_hits = row_count;

  insert into public.scraper_page_cache as c
    (url, etag, last_modified, content_hash, film_keys, hit_count, fetched_at)
  select distinct on (r->>'url')
    r->>'url',
    nullif(r->>'etag', ''),
    nullif(r->>'last_modified', ''),
    nullif(r->>'content_hash', ''),
    coalesce(array(select jsonb_array_elements_text(
      case when jsonb_typeof(r->'film_keys') = 'array' then r->'film_keys' else '[]' end)), '{}'),
    0,
    now()
  from jsonb_array_elements(p_rows) as r
  where not coalesce((r->>'unchanged')::boolean, false)
    and coalesce(r->>'url', '') <> ''
  order by r->>'url'
  on conflict (url) do update set
    etag          = excluded.etag,
    last_modified = excluded.last_modified,
    content_hash  = excluded.content_hash,
    film_keys     = excluded.film_keys,
    hit_count     = 0,
    fetched_at    = now();
  get diagnostics v_written = row_count;

  return jsonb_build_object('written', v_written, 'hits', v_hits);
end;
$$;
revoke all on function public.page_cache_put(text, jsonb) from public;
grant execute on function public.page_cache_put(text, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Matching a resolve-posters entry to catalogue rows: by imdb_id, or — for a
-- row whose id is only in its poster filename — by that filename.
-- -----------------------------------------------------------------------------
create or replace function public.film_matches_imdb(p_row_imdb text, p_row_poster text, p_imdb text)
returns boolean
language sql
immutable
as $$
  select p_imdb is not null and p_imdb <> '' and (
    p_row_imdb = p_imdb
    or (p_row_imdb is null and coalesce(p_row_poster, '') like '%' || p_imdb || '%')
  )
$$;

-- -----------------------------------------------------------------------------
-- set_posters — TMDB artwork keyed on imdb_id.
-- p_map: [{imdb_id, poster_url, backdrop_url}]
-- Counts only rows that actually changed (fixes CLAUDE-HANDOVER §11.11).
-- -----------------------------------------------------------------------------
create or replace function public.set_posters(p_token text, p_map jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_map is null or jsonb_typeof(p_map) <> 'array' then
    return jsonb_build_object('updated', 0);
  end if;

  with m as (
    select distinct on (e->>'imdb_id')
           e->>'imdb_id' as imdb_id,
           nullif(e->>'poster_url', '') as poster_url,
           nullif(e->>'backdrop_url', '') as backdrop_url
      from jsonb_array_elements(p_map) as e
     where coalesce(e->>'imdb_id', '') <> ''
     order by e->>'imdb_id'
  )
  update public.cinema_films f
     set poster_url   = coalesce(m.poster_url, f.poster_url),
         backdrop_url = coalesce(m.backdrop_url, f.backdrop_url),
         imdb_id      = coalesce(f.imdb_id, m.imdb_id)
    from m
   where public.film_matches_imdb(f.imdb_id, f.poster_url, m.imdb_id)
     and (f.poster_url   is distinct from coalesce(m.poster_url, f.poster_url)
       or f.backdrop_url is distinct from coalesce(m.backdrop_url, f.backdrop_url)
       or f.imdb_id is null);

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;
revoke all on function public.set_posters(text, jsonb) from public;
grant execute on function public.set_posters(text, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- set_film_meta — ratings, cast and TMDB genres keyed on imdb_id.
-- p_map: [{imdb_id, imdb_rating, imdb_votes, rt_score, metascore,
--          cast_credits, tmdb_genres}]   null values leave the column alone.
-- -----------------------------------------------------------------------------
create or replace function public.set_film_meta(p_token text, p_map jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_map is null or jsonb_typeof(p_map) <> 'array' then
    return jsonb_build_object('updated', 0);
  end if;

  with m as (
    select distinct on (e->>'imdb_id')
           e->>'imdb_id' as imdb_id,
           case when jsonb_typeof(e->'imdb_rating') = 'number' then (e->>'imdb_rating')::numeric end as imdb_rating,
           case when jsonb_typeof(e->'imdb_votes')  = 'number' then (e->>'imdb_votes')::numeric::int end as imdb_votes,
           case when jsonb_typeof(e->'rt_score')    = 'number' then (e->>'rt_score')::numeric::int end as rt_score,
           case when jsonb_typeof(e->'metascore')   = 'number' then (e->>'metascore')::numeric::int end as metascore,
           case when jsonb_typeof(e->'cast_credits') in ('array', 'object') then e->'cast_credits' end as cast_credits,
           case when jsonb_typeof(e->'tmdb_genres') = 'array' and jsonb_array_length(e->'tmdb_genres') > 0
                then array(select jsonb_array_elements_text(e->'tmdb_genres')) end as tmdb_genres
      from jsonb_array_elements(p_map) as e
     where coalesce(e->>'imdb_id', '') <> ''
     order by e->>'imdb_id'
  )
  update public.cinema_films f
     set imdb_rating  = coalesce(m.imdb_rating, f.imdb_rating),
         imdb_votes   = coalesce(m.imdb_votes, f.imdb_votes),
         rt_score     = coalesce(m.rt_score, f.rt_score),
         metascore    = coalesce(m.metascore, f.metascore),
         cast_credits = coalesce(m.cast_credits, f.cast_credits),
         tmdb_genres  = coalesce(m.tmdb_genres, f.tmdb_genres),
         imdb_id      = coalesce(f.imdb_id, m.imdb_id)
    from m
   where public.film_matches_imdb(f.imdb_id, f.poster_url, m.imdb_id);

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;
revoke all on function public.set_film_meta(text, jsonb) from public;
grant execute on function public.set_film_meta(text, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- SEO health dashboard (from migration 20260918112445, unchanged)
-- -----------------------------------------------------------------------------
create table if not exists public.seo_audit_runs (
  id uuid not null default gen_random_uuid() primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'success',
  trigger text not null default 'cron',
  pages_checked integer not null default 0,
  pages_failing integer not null default 0,
  score integer not null default 0,
  sitemap_url_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.seo_page_checks (
  id uuid not null default gen_random_uuid() primary key,
  run_id uuid not null references public.seo_audit_runs(id) on delete cascade,
  path text not null,
  tier text not null default 'other',
  status_code integer,
  response_ms integer,
  title text,
  title_len integer not null default 0,
  description text,
  description_len integer not null default 0,
  canonical text,
  canonical_ok boolean not null default false,
  h1_count integer not null default 0,
  jsonld_types text[] not null default '{}',
  in_sitemap boolean not null default false,
  issues text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists seo_page_checks_run_idx on public.seo_page_checks(run_id);
create index if not exists seo_audit_runs_started_idx on public.seo_audit_runs(started_at desc);
alter table public.seo_audit_runs enable row level security;
alter table public.seo_page_checks enable row level security;
grant select on public.seo_audit_runs to authenticated;
grant select on public.seo_page_checks to authenticated;
grant all on public.seo_audit_runs to service_role;
grant all on public.seo_page_checks to service_role;
drop policy if exists "Admins can view seo audit runs" on public.seo_audit_runs;
create policy "Admins can view seo audit runs"
  on public.seo_audit_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins can view seo page checks" on public.seo_page_checks;
create policy "Admins can view seo page checks"
  on public.seo_page_checks for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.ingest_seo_audit(p_token text, p_run jsonb, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_count integer := 0;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  insert into public.seo_audit_runs (
    started_at, finished_at, status, trigger,
    pages_checked, pages_failing, score, sitemap_url_count, notes
  ) values (
    coalesce((p_run->>'started_at')::timestamptz, now()),
    now(),
    coalesce(p_run->>'status', 'success'),
    coalesce(p_run->>'trigger', 'cron'),
    coalesce((p_run->>'pages_checked')::int, 0),
    coalesce((p_run->>'pages_failing')::int, 0),
    coalesce((p_run->>'score')::int, 0),
    coalesce((p_run->>'sitemap_url_count')::int, 0),
    p_run->>'notes'
  ) returning id into v_run_id;

  insert into public.seo_page_checks (
    run_id, path, tier, status_code, response_ms, title, title_len,
    description, description_len, canonical, canonical_ok, h1_count,
    jsonld_types, in_sitemap, issues
  )
  select
    v_run_id,
    r->>'path',
    coalesce(r->>'tier', 'other'),
    nullif(r->>'status_code', '')::int,
    nullif(r->>'response_ms', '')::int,
    r->>'title',
    coalesce((r->>'title_len')::int, 0),
    r->>'description',
    coalesce((r->>'description_len')::int, 0),
    r->>'canonical',
    coalesce((r->>'canonical_ok')::boolean, false),
    coalesce((r->>'h1_count')::int, 0),
    coalesce(array(select jsonb_array_elements_text(coalesce(r->'jsonld_types', '[]'::jsonb))), '{}'),
    coalesce((r->>'in_sitemap')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(r->'issues', '[]'::jsonb))), '{}')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;

  get diagnostics v_count = row_count;

  delete from public.seo_audit_runs
   where id in (select id from public.seo_audit_runs order by started_at desc offset 60);

  return jsonb_build_object('run_id', v_run_id, 'rows', v_count);
end;
$$;
revoke all on function public.ingest_seo_audit(text, jsonb, jsonb) from public;
grant execute on function public.ingest_seo_audit(text, jsonb, jsonb) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Scraper progress cursor (added 2026-11-19; see 03-scraper-cursor.sql)
-- -----------------------------------------------------------------------------

insert into public.scraper_cursor (id, pos, step, total)
values (1, 0, 0, 0)
on conflict (id) do nothing;

-- Where the next run should start. p_total is the current sitemap length, so a
-- sitemap that shrank never yields an offset past its end.
create or replace function public.scraper_cursor_get(p_token text, p_total integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos integer;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select pos into v_pos from public.scraper_cursor where id = 1;
  return coalesce(v_pos, 0) % greatest(coalesce(p_total, 1), 1);
end;
$$;
revoke all on function public.scraper_cursor_get(text, integer) from public;
grant execute on function public.scraper_cursor_get(text, integer) to anon, authenticated, service_role;

-- Advance by the pages this run actually completed. Returns the new position.
create or replace function public.scraper_cursor_advance(p_token text, p_by integer, p_total integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := greatest(coalesce(p_total, 1), 1);
  v_pos integer;
begin
  if not public.scraper_token_ok(p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  update public.scraper_cursor
     set pos        = (pos + greatest(coalesce(p_by, 0), 0)) % v_total,
         step       = greatest(coalesce(p_by, 0), 0),
         total      = v_total,
         updated_at = now()
   where id = 1
  returning pos into v_pos;
  return v_pos;
end;
$$;
revoke all on function public.scraper_cursor_advance(text, integer, integer) from public;
grant execute on function public.scraper_cursor_advance(text, integer, integer) to anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Done. Quick check — should list 13 tables:
-- -----------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
 order by table_name;
