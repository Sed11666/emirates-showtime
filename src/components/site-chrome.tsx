import { Link } from "@tanstack/react-router";
import {
  Clapperboard,
  Film,
  LogOut,
  MapPin,
  PlusCircle,
  Search,
  Sparkles,
  Ticket,
  Timer,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { UAE_CITIES } from "@/lib/listings";

const NAV = [
  { to: "/movies", label: "Movies", icon: Film },
  { to: "/cinemas", label: "Cinemas", icon: Clapperboard },
  { to: "/events", label: "Events", icon: Sparkles },
] as const;

function LocationSelector() {
  const [city, setCity] = useState("Dubai");

  useEffect(() => {
    const stored = window.localStorage.getItem("showsouk:city");
    if (stored) setCity(stored);
  }, []);

  const pick = (next: string) => {
    setCity(next);
    window.localStorage.setItem("showsouk:city", next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground md:inline-flex">
          <MapPin className="size-3.5 text-primary" /> {city}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {UAE_CITIES.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => pick(c)}>
            {c}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4">
        <Link to="/" className="flex items-center gap-2">
          <Ticket className="size-6 text-primary" />
          <span className="font-display text-xl font-bold tracking-tight">
            Show<span className="text-gold-gradient">Souk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 text-sm md:flex">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="rounded-full px-3.5 py-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              activeProps={{ className: "text-foreground bg-accent/70" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-4" /> {label}
              </span>
            </Link>
          ))}
          <Link
            to="/"
            hash="coming-soon"
            className="rounded-full px-3.5 py-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-4" /> Coming Soon
            </span>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/"
            hash="discover"
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <Search className="size-4" />
          </Link>
          <LocationSelector />
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
            <Button asChild variant="hero" size="sm">
              <Link to="/auth">
                <UserRound /> Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border/60 bg-[linear-gradient(180deg,transparent,oklch(0.19_0.05_22/0.6))] py-14">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-bold">
            Show<span className="text-gold-gradient">Souk</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Movies, concerts and experiences across Dubai, Abu Dhabi, Sharjah and the Northern
            Emirates.
          </p>
        </div>
        <div className="text-sm">
          <p className="mb-3 text-xs uppercase tracking-widest text-primary">Browse</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link to="/movies" className="hover:text-foreground">
                Movies
              </Link>
            </li>
            <li>
              <Link to="/cinemas" className="hover:text-foreground">
                Cinemas
              </Link>
            </li>
            <li>
              <Link to="/events" className="hover:text-foreground">
                Events
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 text-xs uppercase tracking-widest text-primary">Account</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link to="/auth" className="hover:text-foreground">
                Sign in
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} ShowSouk. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
