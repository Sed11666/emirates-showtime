-- =============================================================================
-- ShowSouk — progress cursor for the cinema scraper (2026-11-19)
-- =============================================================================
-- Run once in Supabase -> SQL Editor. Safe to re-run. Also folded into
-- 01-schema.sql, so a fresh rebuild gets it without this file.
--
-- Why: the scraper used to pick its slice of the sitemap from the clock
-- (slot = floor(now / 30 min) * 10). A run has a 45 s budget, and a slice of
-- ten currently-showing films costs ~30 fetches, so busy slices stopped at
-- page 6 or 7 — and the next fire moved to the next slice regardless. The
-- last pages of every busy slice were skipped on every cycle: measured
-- 2026-11-19, ~11 of ~40 showing films (Ramayana, Ebenezer, How to Rob a Bank,
-- The Cat in the Hat…) had not been refreshed for 18–24 hours.
--
-- Now each run starts where the previous one actually stopped and advances by
-- the pages it completed. No tunable step to keep in sync (the reason the old
-- cursor was abandoned): busy stretches take more runs, quiet ones fewer, and
-- nothing is skipped forever.
-- =============================================================================

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

-- Should return one row: pos 0 on a fresh install.
select id, pos, step, total, updated_at from public.scraper_cursor;
