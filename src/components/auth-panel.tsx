/**
 * auth-panel.tsx — the one sign-in / sign-up form, used by both the /auth page
 * and the booking gate dialog so the two can never drift apart.
 *
 * Methods offered are driven by useAuthProviders(), not hard-coded: mobile only
 * appears once phone auth is switched on in Supabase, because it needs an SMS
 * provider behind it and a button that always errors is worse than no button.
 *
 * Phone sign-up is password + SMS code: Supabase creates the account on signUp
 * and only activates it once the code is verified, so both steps are required.
 */
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuthProviders } from "@/hooks/useAuthProviders";

type Mode = "signin" | "signup";

const emailSchema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(72),
});

/** E.164, which is what Supabase expects — "+9715…" not "05…". */
const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, { message: "Use the full number with country code, e.g. +9715…" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(72),
});

export function AuthPanel({
  mode,
  onModeChange,
  onAuthenticated,
  compact = false,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  /** Fired once a session exists. The gate uses this to offer the booking link. */
  onAuthenticated?: () => void;
  compact?: boolean;
}) {
  const providers = useAuthProviders();
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse({ email, password: emailPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid details");
      return;
    }
    setBusy(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(parsed.data)
        : await supabase.auth.signUp({
            ...parsed.data,
            options: { emailRedirectTo: window.location.href },
          });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "signup") {
      // The project requires email confirmation, so there is no session yet.
      toast.success("Check your email to confirm your account");
      return;
    }
    toast.success("Welcome back");
    onAuthenticated?.();
  }

  async function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse({ phone, password: phonePassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid details");
      return;
    }
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Welcome back");
      onAuthenticated?.();
      return;
    }
    const { error } = await supabase.auth.signUp(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAwaitingCode(true);
    toast.success("We sent you a code by SMS");
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) {
      toast.error("Enter the code we sent you");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: code.trim(),
      type: "sms",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created");
    onAuthenticated?.();
  }

  async function onGoogle() {
    // Straight to Supabase, not through @lovable.dev/cloud-auth-js. That
    // library redirects to /~oauth/initiate, an endpoint Lovable's own hosting
    // serves — the same ~ convention as the tracker we removed in the move to
    // Vercel — so it 404s here. Supabase issues the Google redirect itself.
    //
    // redirectTo must be in the Supabase auth Redirect URLs allowlist, or the
    // callback silently lands on the project's Site URL instead.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Back to wherever they started, so the gate can resume the booking they
      // were part-way through.
      options: { redirectTo: window.location.href },
    });
    if (error) toast.error("Google sign-in failed. Please try again.");
  }

  const verb = mode === "signin" ? "Sign in" : "Create account";

  return (
    <div className={compact ? "" : "mt-8"}>
      {providers.google && (
        <>
          <Button variant="outline" className="w-full" onClick={onGoogle} disabled={busy}>
            {mode === "signin" ? "Continue with Google" : "Sign up with Google"}
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <Tabs defaultValue="email">
        {providers.phone && (
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="phone">Mobile</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="email">
          <form onSubmit={onEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                maxLength={72}
                required
              />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>
              {verb}
            </Button>
          </form>
        </TabsContent>

        {providers.phone && (
          <TabsContent value="phone">
            {awaitingCode ? (
              <form onSubmit={onVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="auth-code">Code sent to {phone}</Label>
                  <Input
                    id="auth-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={8}
                    required
                  />
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  Verify and continue
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setAwaitingCode(false)}
                >
                  Use a different number
                </button>
              </form>
            ) : (
              <form onSubmit={onPhoneSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="auth-phone">Mobile number</Label>
                  <Input
                    id="auth-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+9715XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={16}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-phone-password">Password</Label>
                  <Input
                    id="auth-phone-password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={phonePassword}
                    onChange={(e) => setPhonePassword(e.target.value)}
                    maxLength={72}
                    required
                  />
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {verb}
                </Button>
              </form>
            )}
          </TabsContent>
        )}
      </Tabs>

      <button
        type="button"
        className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground"
        onClick={() => {
          setAwaitingCode(false);
          onModeChange(mode === "signin" ? "signup" : "signin");
        }}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
