/**
 * auth-prompt.tsx — asks visitors to sign in, but only to give them something.
 *
 * Wrap the app in <AuthPromptProvider>, then call promptSignIn() from any
 * feature that genuinely needs an account. Already signed in, the caller's
 * onSignedIn runs immediately and no dialog appears.
 *
 * This used to gate outbound booking links, and deliberately no longer does.
 * Sign-in was the price of *leaving* — a step between the visitor and the
 * cinema, for something they could do by going to VOX directly. We hold no
 * seat, payment or ticket, so the chain asks them to sign in again anyway: two
 * accounts for one film. Sign-in should be the price of getting something,
 * never the price of leaving. Anything gated here must be a feature that
 * cannot work anonymously — alerts, a watchlist, admin.
 *
 * The pending-action machinery survives on purpose. Nothing currently leaves
 * the page mid-flow, since Google is disabled and email sign-in completes
 * inside the dialog, but the moment an OAuth provider is configured the
 * round-trip returns and sessionStorage is what lets someone come back to what
 * they were doing rather than an unexplained home page.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuthPanel } from "@/components/auth-panel";
import { useAuth } from "@/hooks/useAuth";

/** What the visitor was trying to do, so we can say so and resume it. */
export type PendingAction = {
  /** Machine key, e.g. "notify" — identifies the action across a redirect. */
  key: string;
  /** Dialog heading, e.g. "Get release alerts". */
  title: string;
  /** One line on why an account is needed. */
  description: string;
};

const STORAGE_KEY = "showsouk:pending-action";

type PromptValue = {
  /**
   * Runs `onSignedIn` straight away when there is a session; otherwise opens
   * the sign-in dialog and runs it once they are in.
   */
  promptSignIn: (action: PendingAction, onSignedIn?: () => void) => void;
};

const AuthPromptContext = createContext<PromptValue>({ promptSignIn: () => undefined });

export function useAuthPrompt() {
  return useContext(AuthPromptContext);
}

function readPending(): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAction;
    return parsed?.key ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // Stored as a thunk: setState would otherwise call a bare function argument.
  const [resume, setResume] = useState<{ run: () => void } | null>(null);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    setPending(null);
    setResume(null);
    setOpen(false);
  }, []);

  // Signed in while the dialog was open, or returned from a provider redirect.
  useEffect(() => {
    if (loading || !user) return;
    if (resume) {
      const { run } = resume;
      clear();
      run();
      return;
    }
    if (readPending()) clear();
  }, [user, loading, resume, clear]);

  const promptSignIn = useCallback(
    (action: PendingAction, onSignedIn?: () => void) => {
      if (user) {
        onSignedIn?.();
        return;
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
      } catch {
        // Private mode: the in-dialog flow still works, only a redirect
        // round-trip would lose its place.
      }
      setPending(action);
      setResume(onSignedIn ? { run: onSignedIn } : null);
      setMode("signin");
      setOpen(true);
    },
    [user],
  );

  return (
    <AuthPromptContext.Provider value={{ promptSignIn }}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : clear())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title ?? "Sign in"}</DialogTitle>
            <DialogDescription>{pending?.description ?? "Sign in to continue."}</DialogDescription>
          </DialogHeader>
          <AuthPanel compact mode={mode} onModeChange={setMode} />
        </DialogContent>
      </Dialog>
    </AuthPromptContext.Provider>
  );
}
