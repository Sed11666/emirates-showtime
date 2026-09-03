/**
 * __root.tsx — Root layout for every route (TanStack Start).
 *
 * Provides the QueryClientProvider, global <head> defaults, font <link> tags,
 * the sonner <Toaster />, and wraps <Outlet /> in the shared site chrome
 * (header nav + footer, components/site-chrome.tsx). Per-page SEO metadata is
 * defined by each leaf route's head(), not here.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthPromptProvider } from "@/components/auth-prompt";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { THEME_INIT_SCRIPT } from "@/hooks/useTheme";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ShowSouk — Movies & Events Across the Emirates" },
      {
        name: "description",
        content:
          "Discover and book movies, concerts and live events across Dubai, Abu Dhabi, Sharjah and the UAE.",
      },
      { name: "author", content: "ShowSouk" },
      {
        name: "google-site-verification",
        content: "6hQIBt7r257-7mj3ywXEzqrehTWtkmUTpAv1lhI4gq0",
      },
      { property: "og:title", content: "ShowSouk — Movies & Events Across the Emirates" },
      {
        property: "og:description",
        content: "Cinema, concerts and live experiences across the United Arab Emirates.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ShowSouk" },
      // Absolute URL: crawlers do not resolve relative og:image paths.
      { property: "og:image", content: "https://www.showsouk.com/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "ShowSouk — movies, showtimes and cinemas in the UAE" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ShowSouk — Movies & Events Across the Emirates" },
      {
        name: "twitter:description",
        content: "Cinema, concerts and live experiences across the United Arab Emirates.",
      },
      { name: "twitter:image", content: "https://www.showsouk.com/og-image.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      /*
       * Two preloads, not fourteen. @font-face alone does not fetch anything
       * until the layout engine finds text that needs the face, which on a page
       * this size is late; preload starts them with the stylesheet.
       *
       * Only the latin subsets of the body face and the heading face — those
       * two paint above the fold on every route. Preloading a face that is not
       * used on the current page wastes bandwidth and Chrome warns about it,
       * which is why the other twelve are left to load on demand.
       *
       * crossOrigin is required even same-origin: fonts are fetched in CORS
       * mode, and without it the preloaded file is discarded and fetched again.
       */
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/dm-sans-400-latin.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/outfit-700-latin.woff2",
        crossOrigin: "anonymous",
      },
      // The header's own ticket mark (lucide Ticket, same path as SiteHeader) in
      // the header's own colours: --primary green on the --background ground.
      //
      // This is a deliberate, owner-chosen trade. A gold-on-dark version reads
      // more clearly at 16px, because dark green on near-black has little
      // contrast against a dark browser tab strip. Brand consistency was chosen
      // over that legibility. Don't "fix" it to gold without asking.
      //
      // The ?v= is a cache-buster. Browsers pin a favicon hard, and without it
      // the previous icon survives a deploy for days in tabs that have already
      // seen it. Bump it whenever the artwork changes.
      { rel: "icon", href: "/favicon.ico?v=4", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below mutates <html>'s class
    // and colorScheme before React hydrates, so server and client markup differ
    // here by design. Without it React logs a mismatch on every page load.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/*
          Appearance must be applied before first paint. A hook cannot run early
          enough, so this blocking script reads the stored preference and sets
          the class itself; anything later means every visitor sees a flash of
          the wrong theme. Keep it in <head> and keep it synchronous.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        {/*
          Vercel Web Analytics. It reports only from production deployments and
          its /_vercel/insights request is blocked by ad blockers, so its counts
          read low against Vercel's runtime logs. The logs are the source of
          truth for "did anyone visit"; this is the readable dashboard on top.
        */}
        <Analytics />
        {/*
          Vercel Speed Insights — real Core Web Vitals from real visits.

          Vercel serves /_vercel/speed-insights/script.js for this project
          whether or not anything asks for it, so the dashboard looked enabled
          while collecting nothing: no build ever shipped this component, and a
          panel with no data point is indistinguishable from a panel with a
          broken beacon. Both this and <Analytics /> report only from production
          and are blocked by ad blockers, so treat their counts as a floor.
        */}
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query provider: the prompt checks which auth methods the
          backend actually offers before rendering its dialog. */}
      <AuthPromptProvider>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <div className="flex-1">
            <Outlet />
          </div>
          <SiteFooter />
        </div>
      </AuthPromptProvider>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
