-- 1) has_role: switch to SECURITY INVOKER (users can read their own roles via RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) trigger-only definer function must not be API-callable
REVOKE ALL ON FUNCTION public.grant_admin_for_known_email() FROM PUBLIC, anon, authenticated;

-- 3) admin-only read access to scrape run history
CREATE POLICY "Admins can view cinema scrape runs"
ON public.cinema_scrape_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view event scrape runs"
ON public.event_scrape_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.cinema_scrape_runs TO authenticated;
GRANT SELECT ON public.event_scrape_runs TO authenticated;
GRANT ALL ON public.cinema_scrape_runs TO service_role;
GRANT ALL ON public.event_scrape_runs TO service_role;