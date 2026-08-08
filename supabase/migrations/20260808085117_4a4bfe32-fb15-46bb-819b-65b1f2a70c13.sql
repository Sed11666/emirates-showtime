CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'scrape-events-6h',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9236f6c6-9e4f-4f96-8288-cbb769f606b6.lovable.app/api/public/hooks/scrape-events',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_kgs2SRysOO12V48i6Voqog_BUQRmWWj"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'scrape-events-daily-full',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9236f6c6-9e4f-4f96-8288-cbb769f606b6.lovable.app/api/public/hooks/scrape-events?force=1',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_kgs2SRysOO12V48i6Voqog_BUQRmWWj"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);