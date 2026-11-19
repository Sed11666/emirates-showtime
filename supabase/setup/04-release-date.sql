-- =============================================================================
-- ShowSouk — film release dates for the "New" label (2026-11-19)
-- =============================================================================
-- Run once in Supabase -> SQL Editor, BEFORE the code that reads release_date
-- is deployed (the site selects the column; selecting a column that does not
-- exist would fail every page). Safe to re-run. Also folded into 01-schema.sql.
--
-- Adds cinema_films.release_date and teaches ingest_cinema_films to store it.
-- The scraper reads it from cinemauae's hero spec line (calendar icon),
-- present on 47 of 47 film pages checked; re-releases carry their re-release
-- date. The site shows "New" from the day before release through day 3.
-- =============================================================================

alter table public.cinema_films add column if not exists release_date date;

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
      case when (r->>'release_date') ~ '^\d{4}-\d{2}-\d{2}$'
           then (r->>'release_date')::date end           as release_date,
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
      duration_mins, synopsis, director, cast_names, release_date,
      is_active, last_seen_at
    )
    select
      cinema, title, title_key, city, venues, formats, showtimes,
      booking_url, source_url, poster_url, imdb_id, genre, language, rating,
      duration_mins, synopsis, director, cast_names, release_date,
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
      release_date  = coalesce(excluded.release_date, f.release_date),
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

-- Should show the new column, type date.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'cinema_films' and column_name = 'release_date';
