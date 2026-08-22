/**
 * useAuthProviders — which sign-in methods the backend actually accepts.
 *
 * Supabase publishes its enabled providers at /auth/v1/settings, so the UI can
 * offer exactly what works instead of hard-coding a list. That matters for
 * phone: it needs a configured SMS provider (Twilio credentials, paid per
 * message), and offering a "Continue with mobile" button that errors is worse
 * than not offering it. Enable phone in Supabase and the option appears on the
 * next page load — no redeploy, no code change.
 */
import { useQuery } from "@tanstack/react-query";

export type AuthProviders = { email: boolean; google: boolean; phone: boolean };

const FALLBACK: AuthProviders = { email: true, google: false, phone: false };

/**
 * Google is forced off, and /auth/v1/settings cannot tell us why.
 *
 * Supabase reports google:true whenever the provider is switched on, whether or
 * not it holds credentials. This project is switched on with none: Lovable
 * Cloud brokers Google through its own OAuth app and exposes no Client ID or
 * secret fields, and the database lives in Lovable's Supabase organisation, so
 * there is no dashboard to add them in. Attempting it reaches Supabase and gets
 * `{"error_code":"validation_failed","msg":"Unsupported provider: missing OAuth
 * secret"}` — a raw JSON page, worse than no button at all.
 *
 * Set to false the moment the project has its own Google credentials, whether
 * from moving to a Supabase project you control or Lovable exposing the fields.
 * The button then returns on its own; nothing else needs changing, and the
 * sign-in code already talks to Supabase directly.
 */
const GOOGLE_LACKS_CREDENTIALS = true;

export function useAuthProviders(): AuthProviders {
  const { data } = useQuery({
    queryKey: ["auth-providers"],
    // Public, cheap and changes only when someone edits Supabase settings.
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<AuthProviders> => {
      const url = import.meta.env?.["VITE_SUPABASE_URL"];
      const key = import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) return FALLBACK;
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      if (!res.ok) return FALLBACK;
      const json = (await res.json()) as { external?: Record<string, boolean> };
      const ext = json.external ?? {};
      return {
        email: ext["email"] !== false,
        google: ext["google"] === true && !GOOGLE_LACKS_CREDENTIALS,
        phone: ext["phone"] === true,
      };
    },
  });

  return data ?? FALLBACK;
}
