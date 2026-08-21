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
        google: ext["google"] === true,
        phone: ext["phone"] === true,
      };
    },
  });

  return data ?? FALLBACK;
}
