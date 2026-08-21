/**
 * booking-gate.tsx — asks visitors to sign in before we hand them to a cinema.
 *
 * Wrap the app in <BookingGateProvider>, then have any outbound showtime link
 * call guardBooking() from its onClick. Signed in, nothing happens and the link
 * behaves normally. Signed out, the click is intercepted and a dialog offers
 * sign-in; the booking resumes afterwards.
 *
 * Two things drive the design:
 *
 * 1. We never auto-open the cinema after sign-in. Browsers block window.open()
 *    once the call is no longer inside the original user gesture — which it is
 *    not, after an await or an OAuth round-trip — so the popup would vanish
 *    silently. The dialog instead shows a real link for the visitor to click.
 *
 * 2. Google sign-in leaves the page entirely and comes back. The pending
 *    booking is therefore kept in sessionStorage, not React state, and is
 *    picked up on return so the visitor is not dumped back on a list with no
 *    idea where they were.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/components/auth-panel";
import { useAuth } from "@/hooks/useAuth";

export type PendingBooking = { href: string; film: string; venue: string; time: string };

const STORAGE_KEY = "showsouk:pending-booking";

type GateValue = {
  /**
   * Call from a showtime link's onClick. Returns true when the click was
   * intercepted, in which case the caller must preventDefault().
   */
  guardBooking: (booking: PendingBooking) => boolean;
};

const BookingGateContext = createContext<GateValue>({ guardBooking: () => false });

export function useBookingGate() {
  return useContext(BookingGateContext);
}

function readPending(): PendingBooking | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBooking;
    return parsed?.href?.startsWith("http") ? parsed : null;
  } catch {
    return null;
  }
}

export function BookingGateProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Coming back from Google: restore whatever they were booking.
  useEffect(() => {
    if (loading || !user) return;
    const saved = readPending();
    if (!saved) return;
    setPending(saved);
    setOpen(true);
  }, [user, loading]);

  const guardBooking = useCallback(
    (booking: PendingBooking) => {
      if (user) return false; // signed in: let the link through untouched
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(booking));
      } catch {
        // Private mode or storage disabled: the in-dialog flow still works,
        // only the OAuth round-trip loses its place.
      }
      setPending(booking);
      setMode("signin");
      setOpen(true);
      return true;
    },
    [user],
  );

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    setPending(null);
    setOpen(false);
  }, []);

  const ready = Boolean(user) && Boolean(pending);

  return (
    <BookingGateContext.Provider value={{ guardBooking }}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : clear())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ready ? "You're signed in" : mode === "signin" ? "Sign in to book" : "Create an account"}
            </DialogTitle>
            <DialogDescription>
              {pending ? (
                ready ? (
                  <>
                    Continue to book <span className="text-foreground">{pending.film}</span> at{" "}
                    {pending.venue}, {pending.time}.
                  </>
                ) : (
                  <>
                    We&rsquo;ll take you to the cinema to book{" "}
                    <span className="text-foreground">{pending.film}</span> at {pending.venue},{" "}
                    {pending.time}.
                  </>
                )
              ) : (
                "Sign in to continue to the cinema's booking page."
              )}
            </DialogDescription>
          </DialogHeader>

          {ready ? (
            <div className="space-y-3">
              {/* A real anchor the visitor clicks: a scripted window.open here
                  would be outside the original gesture and get blocked. */}
              <Button asChild variant="hero" className="w-full">
                <a href={pending!.href} target="_blank" rel="noopener noreferrer" onClick={clear}>
                  Continue to booking
                </a>
              </Button>
              <button
                type="button"
                onClick={clear}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Not now
              </button>
            </div>
          ) : (
            <AuthPanel compact mode={mode} onModeChange={setMode} />
          )}
        </DialogContent>
      </Dialog>
    </BookingGateContext.Provider>
  );
}
