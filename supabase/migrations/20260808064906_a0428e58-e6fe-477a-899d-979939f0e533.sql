CREATE TABLE public.cinema_films (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema text NOT NULL,
  title text NOT NULL,
  title_key text NOT NULL,
  city text,
  venues text[] NOT NULL DEFAULT '{}',
  genre text,
  language text,
  rating text,
  duration_mins integer,
  poster_url text,
  synopsis text,
  formats text[] NOT NULL DEFAULT '{}',
  showtimes jsonb NOT NULL DEFAULT '[]'::jsonb,
  booking_url text,
  source_url text,
  is_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cinema, title_key, city)
);

GRANT SELECT ON public.cinema_films TO anon;
GRANT SELECT ON public.cinema_films TO authenticated;
GRANT ALL ON public.cinema_films TO service_role;

ALTER TABLE public.cinema_films ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active cinema films are publicly viewable"
ON public.cinema_films FOR SELECT
USING (is_active = true);

CREATE TRIGGER update_cinema_films_updated_at
BEFORE UPDATE ON public.cinema_films
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX cinema_films_cinema_idx ON public.cinema_films (cinema);
CREATE INDEX cinema_films_city_idx ON public.cinema_films (city);

CREATE TABLE public.cinema_scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema text NOT NULL,
  source_url text,
  content_hash text,
  changed boolean NOT NULL DEFAULT false,
  films_upserted integer NOT NULL DEFAULT 0,
  films_deactivated integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cinema_scrape_runs TO service_role;

ALTER TABLE public.cinema_scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX cinema_scrape_runs_cinema_idx ON public.cinema_scrape_runs (cinema, created_at DESC);