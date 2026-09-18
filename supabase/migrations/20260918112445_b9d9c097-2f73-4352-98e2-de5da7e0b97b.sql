CREATE TABLE public.seo_audit_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'success',
  trigger text NOT NULL DEFAULT 'cron',
  pages_checked integer NOT NULL DEFAULT 0,
  pages_failing integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  sitemap_url_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.seo_page_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.seo_audit_runs(id) ON DELETE CASCADE,
  path text NOT NULL,
  tier text NOT NULL DEFAULT 'other',
  status_code integer,
  response_ms integer,
  title text,
  title_len integer NOT NULL DEFAULT 0,
  description text,
  description_len integer NOT NULL DEFAULT 0,
  canonical text,
  canonical_ok boolean NOT NULL DEFAULT false,
  h1_count integer NOT NULL DEFAULT 0,
  jsonld_types text[] NOT NULL DEFAULT '{}',
  in_sitemap boolean NOT NULL DEFAULT false,
  issues text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seo_page_checks_run_idx ON public.seo_page_checks(run_id);
CREATE INDEX seo_audit_runs_started_idx ON public.seo_audit_runs(started_at DESC);

GRANT SELECT ON public.seo_audit_runs TO authenticated;
GRANT SELECT ON public.seo_page_checks TO authenticated;
GRANT ALL ON public.seo_audit_runs TO service_role;
GRANT ALL ON public.seo_page_checks TO service_role;

ALTER TABLE public.seo_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_page_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view seo audit runs"
  ON public.seo_audit_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view seo page checks"
  ON public.seo_page_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.ingest_seo_audit(p_token text, p_run jsonb, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_run_id uuid;
  v_count integer := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.scraper_auth WHERE token = p_token) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.seo_audit_runs (
    started_at, finished_at, status, trigger,
    pages_checked, pages_failing, score, sitemap_url_count, notes
  ) VALUES (
    COALESCE((p_run->>'started_at')::timestamptz, now()),
    now(),
    COALESCE(p_run->>'status', 'success'),
    COALESCE(p_run->>'trigger', 'cron'),
    COALESCE((p_run->>'pages_checked')::int, 0),
    COALESCE((p_run->>'pages_failing')::int, 0),
    COALESCE((p_run->>'score')::int, 0),
    COALESCE((p_run->>'sitemap_url_count')::int, 0),
    p_run->>'notes'
  ) RETURNING id INTO v_run_id;

  INSERT INTO public.seo_page_checks (
    run_id, path, tier, status_code, response_ms, title, title_len,
    description, description_len, canonical, canonical_ok, h1_count,
    jsonld_types, in_sitemap, issues
  )
  SELECT
    v_run_id,
    r->>'path',
    COALESCE(r->>'tier', 'other'),
    NULLIF(r->>'status_code', '')::int,
    NULLIF(r->>'response_ms', '')::int,
    r->>'title',
    COALESCE((r->>'title_len')::int, 0),
    r->>'description',
    COALESCE((r->>'description_len')::int, 0),
    r->>'canonical',
    COALESCE((r->>'canonical_ok')::boolean, false),
    COALESCE((r->>'h1_count')::int, 0),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'jsonld_types', '[]'::jsonb))), '{}'),
    COALESCE((r->>'in_sitemap')::boolean, false),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'issues', '[]'::jsonb))), '{}')
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.seo_audit_runs
  WHERE id IN (
    SELECT id FROM public.seo_audit_runs ORDER BY started_at DESC OFFSET 60
  );

  RETURN jsonb_build_object('run_id', v_run_id, 'rows', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_seo_audit(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_seo_audit(text, jsonb, jsonb) TO anon, authenticated, service_role;