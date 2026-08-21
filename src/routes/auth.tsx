/**
 * Route "/auth" — Customer sign in / sign up.
 *
 * The form itself lives in <AuthPanel> and is shared with the booking gate, so
 * the two can never offer different methods. Which methods appear is decided at
 * runtime from Supabase's own settings — see useAuthProviders.
 *
 * Admin privileges are separate and come from the `user_roles` table.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthPanel } from "@/components/auth-panel";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in | ShowSouk" },
      {
        name: "description",
        content:
          "Sign in or create a ShowSouk account to book UAE cinema tickets and keep track of what you want to see.",
      },
      { property: "og:title", content: "Sign in | ShowSouk" },
      {
        property: "og:description",
        content: "Create a ShowSouk account to book UAE cinema tickets.",
      },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-20">
      <h1 className="font-display text-3xl font-bold">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {mode === "signin"
          ? "Sign in to book tickets and keep track of what you want to see."
          : "One account for booking across every UAE cinema chain."}
      </p>

      <AuthPanel mode={mode} onModeChange={setMode} />
    </main>
  );
}
