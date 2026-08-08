CREATE TYPE public.listing_kind AS ENUM ('movie','event');

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.listing_kind NOT NULL DEFAULT 'movie',
  title text NOT NULL,
  description text,
  poster_url text,
  genre text,
  language text,
  venue text,
  city text NOT NULL DEFAULT 'Dubai',
  price_aed numeric(10,2) NOT NULL DEFAULT 0,
  starts_at timestamptz,
  duration_mins integer,
  certification text,
  featured boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listings are publicly viewable"
  ON public.listings FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create listings"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update their listings"
  ON public.listings FOR UPDATE TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can delete their listings"
  ON public.listings FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_listings_updated_at
BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX listings_kind_idx ON public.listings (kind);
CREATE INDEX listings_city_idx ON public.listings (city);

INSERT INTO public.listings (kind, title, description, poster_url, genre, language, venue, city, price_aed, starts_at, duration_mins, certification, featured) VALUES
('movie','Dune: Part Three','The Atreides saga returns to the sands, screened in IMAX laser across the Emirates.','https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&q=80','Sci-Fi','English','VOX Cinemas, Mall of the Emirates','Dubai',65.00, now() + interval '2 day', 166, 'PG-15', true),
('movie','Sikandar Nights','A Bollywood action spectacle with Gulf-exclusive early screenings.','https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80','Action','Hindi','Reel Cinemas, Dubai Mall','Dubai',55.00, now() + interval '1 day', 152, 'PG-15', false),
('movie','Sea of Pearls','An Emirati drama tracing a pearl divers family across three generations.','https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80','Drama','Arabic','Vox Cinemas, Yas Mall','Abu Dhabi',45.00, now() + interval '3 day', 128, 'PG', true),
('movie','Falcon Squad','Animated family adventure over the dunes of Liwa.','https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800&q=80','Animation','English','Novo Cinemas, City Centre Sharjah','Sharjah',38.00, now() + interval '4 day', 98, 'G', false),
('event','Abu Dhabi Grand Prix Concert Night','Headline stadium show closing out race weekend on Yas Island.','https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80','Concert','English','Etihad Park, Yas Island','Abu Dhabi',495.00, now() + interval '20 day', 240, 'All ages', true),
('event','Dubai Comedy Nights','A stand-up lineup of regional and international headliners.','https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=800&q=80','Comedy','English','Coca-Cola Arena','Dubai',175.00, now() + interval '9 day', 120, '18+', false),
('event','Sharjah Book Fair Live Sessions','Author talks, poetry and workshops at Expo Centre Sharjah.','https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&q=80','Culture','Arabic','Expo Centre Sharjah','Sharjah',0.00, now() + interval '15 day', 300, 'All ages', false),
('event','Desert Beats Festival','Sunset-to-sunrise electronic festival in the Al Marmoom desert.','https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&q=80','Festival','English','Al Marmoom Desert Conservation Reserve','Dubai',320.00, now() + interval '28 day', 600, '21+', true);