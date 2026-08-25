/**
 * Route "/coming-soon" — redirect only.
 *
 * Upcoming releases moved into /cinemas as a tab: a visitor deciding what to
 * watch is asking one question, and two nav items made them pick a section
 * before they had the information to pick with.
 *
 * The route is kept rather than deleted so the links that existed while it was
 * live keep resolving — the same reason /movies still exists.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/coming-soon")({
  beforeLoad: () => {
    throw redirect({ to: "/cinemas", search: { view: "upcoming" }, replace: true });
  },
});
