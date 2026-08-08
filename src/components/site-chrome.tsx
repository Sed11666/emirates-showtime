import { Link } from "@tanstack/react-router";
import { Film, Ticket, PlusCircle, LogOut, Sparkles, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <Ticket className="size-6 text-primary" />
          <span className="font-display text-xl font-bold tracking-tight">
            Show<span className="text-gold-gradient">Souk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm sm:flex">
          <Link
            to="/movies"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "text-foreground bg-accent" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Film className="size-4" /> Movies
            </span>
          </Link>
          <Link
            to="/events"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "text-foreground bg-accent" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4" /> Events
            </span>
          </Link>
          <Link
            to="/cinemas"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "text-foreground bg-accent" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Clapperboard className="size-4" /> Cinemas
            </span>
          </Link>
        </nav>


        <div className="ml-auto flex items-center gap-2">
          {isAdmin ? (
            <Button asChild variant="gold" size="sm">
              <Link to="/admin">
                <PlusCircle /> Add listing
              </Link>
            </Button>
          ) : null}
          {user ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70 py-10">
      <div className="mx-auto max-w-6xl px-4 text-sm text-muted-foreground">
        <p className="font-display text-base text-foreground">ShowSouk</p>
        <p className="mt-1">
          Movies, concerts and experiences across Dubai, Abu Dhabi, Sharjah and the Northern
          Emirates.
        </p>
      </div>
    </footer>
  );
}
