-- 1. Collapse duplicate rows that exist only because city was NULL
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cinema, title_key, coalesce(city, '')
           ORDER BY (showtimes IS NOT NULL) DESC,
                    jsonb_array_length(CASE WHEN jsonb_typeof(showtimes) = 'array' THEN showtimes ELSE '[]'::jsonb END) DESC,
                    last_seen_at DESC,
                    created_at DESC
         ) AS rn
  FROM public.cinema_films
)
DELETE FROM public.cinema_films f
USING ranked r
WHERE f.id = r.id AND r.rn > 1;

-- 2. Backfill and lock down city
UPDATE public.cinema_films SET city = '' WHERE city IS NULL;
ALTER TABLE public.cinema_films ALTER COLUMN city SET DEFAULT '';
ALTER TABLE public.cinema_films ALTER COLUMN city SET NOT NULL;

-- 3. Ensure the unique index backing the upsert target exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'cinema_films'
      AND indexname = 'cinema_films_cinema_title_key_city_key'
  ) THEN
    CREATE UNIQUE INDEX cinema_films_cinema_title_key_city_key
      ON public.cinema_films (cinema, title_key, city);
  END IF;
END $$;

-- 4. One-off cleanup: drop screenings before today (Asia/Dubai) and de-duplicate
UPDATE public.cinema_films f
SET showtimes = COALESCE(cleaned.arr, '[]'::jsonb)
FROM (
  SELECT c.id,
         jsonb_agg(DISTINCT s.elem) FILTER (
           WHERE s.elem->>'date' IS NULL
              OR s.elem->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
              OR (s.elem->>'date')::date >= (now() AT TIME ZONE 'Asia/Dubai')::date
         ) AS arr
  FROM public.cinema_films c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.showtimes) = 'array' THEN c.showtimes ELSE '[]'::jsonb END
  ) AS s(elem)
  GROUP BY c.id
) AS cleaned
WHERE f.id = cleaned.id
  AND f.showtimes IS DISTINCT FROM COALESCE(cleaned.arr, '[]'::jsonb);