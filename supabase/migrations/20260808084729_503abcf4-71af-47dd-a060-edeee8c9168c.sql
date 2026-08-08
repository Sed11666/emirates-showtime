CREATE TABLE public.live_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL,
  title_key text NOT NULL,
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
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (source, title_key)
);

GRANT SELECT ON public.live_events TO anon;
GRANT SELECT ON public.live_events TO authenticated;
GRANT ALL ON public.live_events TO service_role;

ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active live events are publicly viewable"
ON public.live_events FOR SELECT
USING (is_active = true);

CREATE TRIGGER update_live_events_updated_at
BEFORE UPDATE ON public.live_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.event_scrape_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  source_url text,
  content_hash text,
  changed boolean NOT NULL DEFAULT false,
  events_upserted integer NOT NULL DEFAULT 0,
  events_deactivated integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.event_scrape_runs TO service_role;

ALTER TABLE public.event_scrape_runs ENABLE ROW LEVEL SECURITY;