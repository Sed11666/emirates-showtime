/**
 * useTheme — Light / Dark / System appearance, persisted per browser.
 *
 * The stored preference is one of three values; the *resolved* theme is only
 * ever "dark" or "light". "system" follows the OS and keeps following it, so
 * the listener stays attached rather than reading matchMedia once.
 *
 * Nothing here runs during SSR. The class is put on <html> before first paint
 * by the inline script in __root.tsx — see THEME_INIT_SCRIPT below — because a
 * hook cannot run early enough and every visitor would otherwise see a flash of
 * the wrong theme. This hook only keeps that class in sync afterwards, so the
 * two must agree on the storage key and the class names.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "showsouk-theme";

/**
 * The light palette now exists — `.light` in styles.css, alongside overrides
 * for the four effects that hardcode dark-ground colours (film-grain,
 * gold-glow, marquee-lights, gold-rule).
 *
 * Kept as a flag rather than deleted because it is the one switch that hides
 * the Light and System options again, should the palette ever need pulling.
 */
export const LIGHT_PALETTE_READY = true;

function systemPrefersLight(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (!LIGHT_PALETTE_READY) return "dark";
  if (theme === "system") return systemPrefersLight() ? "light" : "dark";
  return theme;
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

function readStored(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    // Private mode and blocked storage both throw. Following the OS is a
    // reasonable answer for someone whose choice we cannot remember anyway.
    return "system";
  }
}

export function useTheme() {
  // "system" on both server and first client render so hydration matches; the
  // real preference arrives in the effect below. The inline script has already
  // painted the correct theme by then, so this never causes a visible change.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    const next = resolveTheme(stored);
    setResolved(next);
    applyTheme(next);
  }, []);

  // Keep following the OS while the preference is "system".
  useEffect(() => {
    if (theme !== "system" || !LIGHT_PALETTE_READY) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = resolveTheme("system");
      setResolved(next);
      applyTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference is lost on reload, but the current page still responds.
    }
    const resolvedNext = resolveTheme(next);
    setResolved(resolvedNext);
    applyTheme(resolvedNext);
  }, []);

  return { theme, resolved, setTheme, lightAvailable: LIGHT_PALETTE_READY };
}

/**
 * Runs before first paint, inlined into <head>. Deliberately dependency-free
 * and wrapped in try/catch: if it throws, the page renders unstyled-dark rather
 * than not at all. Keep the storage key and class names identical to the hook.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)},ready=${String(LIGHT_PALETTE_READY)};
var s=null;try{s=localStorage.getItem(k)}catch(e){}
if(s!=='light'&&s!=='dark'&&s!=='system')s='system';
var r='dark';
if(ready){r=s==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):s}
var d=document.documentElement;
d.classList.toggle('dark',r==='dark');
d.classList.toggle('light',r==='light');
d.style.colorScheme=r;
}catch(e){document.documentElement.classList.add('dark')}})()`;
