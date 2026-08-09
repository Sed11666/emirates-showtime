/**
 * useIsAdmin — Role check against the `user_roles` table.
 *
 * Roles are deliberately stored in their own table (never on a profile row) to
 * avoid privilege escalation; RLS on `listings` enforces the same rule
 * server-side. This hook only gates UI (the /admin link and management
 * controls) — it is never the security boundary.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useIsAdmin() {
  const { user, loading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Allowlisted developer emails (verified) self-claim the admin role.
      await supabase.rpc("claim_admin_role");

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
  });

  return {
    isAdmin: !!data,
    loading: loading || (!!user && isLoading),
  };
}
