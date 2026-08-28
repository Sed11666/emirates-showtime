/**
 * account-menu.tsx — the signed-in visitor's menu, anchored to the header avatar.
 *
 * What is deliberately NOT here: bookings. ShowSouk holds no seat, no payment
 * and no order — the booking happens on the chain's own site and we never learn
 * the outcome — so a "My bookings" entry would promise something the product
 * cannot deliver. Same reasoning rules out order history and support chat.
 *
 * What is left is small on purpose. Every row below is either a real piece of
 * account state or a setting that visibly does something; at this stage a
 * longer menu could only be padded with links to pages that do not exist.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, PlusCircle } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ThemeOptions } from "@/components/theme-menu";
import { supabase } from "@/integrations/supabase/client";

/** "syed.ebaad@gmail.com" → "S". Falls back rather than rendering an empty circle. */
function initialFor(email: string | undefined): string {
  const trimmed = (email ?? "").trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

export function AccountMenu() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const email = user.email ?? undefined;

  async function onSignOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (error) toast.error("Couldn't sign you out. Please try again.");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Your account"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initialFor(email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initialFor(email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block text-xs font-normal text-muted-foreground">Signed in as</span>
            {/* Email is the only identity we collect, and it can be long. */}
            <span className="block truncate text-sm font-medium">{email ?? "Your account"}</span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <ThemeOptions />

        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2">
              <Link to="/admin">
                <PlusCircle className="size-4" />
                Manage listings
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => void onSignOut()}
          disabled={signingOut}
          className="gap-2"
        >
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
