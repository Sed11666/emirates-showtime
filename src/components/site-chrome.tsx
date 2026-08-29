/**
 * site-chrome.tsx — Global header + footer rendered by __root.tsx.
 *
 * Desktop (md+): 3-column grid — [logo + LocationSelector] [centred nav:
 * Home, Cinemas, Events] [search, admin, account].
 * Mobile: the same header collapses to logo + compact location chip + search +
 * account, and the nav moves into a fixed bottom tab bar (MobileTabBar) so
 * Home / Cinemas / Events are always reachable with a thumb. Upcoming releases
 * are a tab inside /cinemas, not a nav item. The city chosen in
 * LocationSelector is persisted and read by useUserLocation as the fallback
 * position for nearest-cinema sorting. Admin-only links are gated by useIsAdmin.
 */
import { Link } from "@tanstack/react-router";
import {
  Clapperboard,
  Home,
  MapPin,
  PlusCircle,
  Search,
  Sparkles,
  Ticket,
  UserRound,
} from "lucide-react";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account-menu";
import { ThemeMenu } from "@/components/theme-menu";
import { SearchOverlay } from "@/components/search-overlay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { UAE_CITIES } from "@/lib/listings";
import { CITY_BY_SLUG } from "@/lib/venues";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/cinemas", label: "Cinemas", icon: Clapperboard },
  { to: "/events", label: "Events", icon: Sparkles },
] as const;

/** City picker. Visible on every breakpoint; label hidden on the smallest phones. */
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
        <button
          aria-label={`Change city, currently ${city}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground md:px-3"
        >
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-[8ch] truncate">{city}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {UAE_CITIES.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => pick(c)}>
            {c}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Fixed bottom tab bar — mobile replacement for the centred desktop nav. */
function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none md:gap-5">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2">
            <Ticket className="size-6 shrink-0 text-primary" />
            <span className="truncate font-display text-lg font-bold tracking-tight sm:text-xl">
              Show<span className="text-gold-gradient">Souk</span>
            </span>
          </Link>
          <LocationSelector />
        </div>

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
        </nav>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <Search className="size-4" />
          </button>
          {isAdmin ? (
            <Button asChild variant="gold" size="sm" className="hidden sm:inline-flex">
              <Link to="/admin">
                <PlusCircle /> Add listing
              </Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="gold" size="icon" className="sm:hidden" aria-label="Add listing">
              <Link to="/admin">
                <PlusCircle />
              </Link>
            </Button>
          ) : null}
          {user ? (
            <AccountMenu />
          ) : (
            <>
              <ThemeMenu />
              <Button asChild variant="hero" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth">
                  <UserRound /> Sign in
                </Link>
              </Button>
              <Button asChild variant="hero" size="icon" className="sm:hidden" aria-label="Sign in">
                <Link to="/auth">
                  <UserRound />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </header>
      <MobileTabBar />
    </>
  );

}


export function SiteFooter() {
  return (
    <footer className="relative mt-16 border-t border-border/60 bg-[linear-gradient(180deg,transparent,oklch(0.19_0.04_280/0.6))] pb-[calc(5rem+env(safe-area-inset-bottom))] pt-10 sm:mt-24 sm:py-14 md:pb-14">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-bold">
            Show<span className="text-gold-gradient">Souk</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Movies, concerts and experiences across Dubai, Abu Dhabi, Sharjah and the Northern
            Emirates.
          </p>
          {/* Every emirate, on every page. The city pages are otherwise only
              reachable from each other and the sitemap, and a page a crawler
              has to be told about is weaker than one it can walk to. */}
          <nav aria-label="Cinemas by emirate" className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-widest text-primary">By emirate</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              {Object.entries(CITY_BY_SLUG).map(([slug, name]) => (
                <li key={slug}>
                  <Link
                    to="/movies-in/$city"
                    params={{ city: slug }}
                    className="hover:text-foreground"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="text-sm">
          <p className="mb-3 text-xs uppercase tracking-widest text-primary">Browse</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
            </li>
            <li>
              <Link to="/cinemas" search={{}} className="hover:text-foreground">
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
            <li>
              <Link to="/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            {/* Required by TMDB’s API terms, which ask for a visible
                acknowledgement wherever their data is used. */}
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            © {new Date().getFullYear()} ShowSouk. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
