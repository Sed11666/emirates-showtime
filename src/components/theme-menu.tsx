/**
 * theme-menu.tsx — the Appearance control, shared by both header states.
 *
 * The rows used to live inside account-menu.tsx, which the header only renders
 * for a signed-in visitor. That made light mode an account feature, and it is
 * not one: it is a device preference, and the people most likely to want it —
 * a first-time visitor on a bright phone — were exactly the ones who could not
 * reach it. Anyone can flip the theme now, signed in or not.
 *
 * Exported in two shapes so the two headers cannot drift: ThemeOptions is the
 * bare rows for the account dropdown, ThemeMenu is a standalone icon button and
 * dropdown for the signed-out header.
 */
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/hooks/useTheme";

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeOptions() {
  const { theme, setTheme, lightAvailable } = useTheme();
  return (
    <>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const unavailable = value === "light" && !lightAvailable;
        return (
          <DropdownMenuItem
            key={value}
            // Keep the row closed to selection rather than hiding it: people
            // look for Light, and "not yet" is a clearer answer than absence.
            disabled={unavailable}
            onSelect={(event) => {
              if (unavailable) {
                event.preventDefault();
                return;
              }
              setTheme(value);
            }}
            className="gap-2"
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {unavailable ? (
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            ) : theme === value ? (
              <Check className="size-4 text-gold" />
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function ThemeMenu() {
  // The icon shows what is currently in effect, not what tapping will do —
  // a sun that means "you are in light mode" reads more plainly than one
  // that means "switch to light".
  const { resolved } = useTheme();
  const Icon = resolved === "light" ? Sun : Moon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Appearance">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <ThemeOptions />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
