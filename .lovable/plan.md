# Premium cinematic polish for ShowSouk

## Goal
Enhance the existing ShowSouk experience systemically without rebuilding it or changing any content, routes, data, features, labels, typography, font sizes, brand colors, or user flows. The existing application remains the source of truth; the work is a presentation and interaction upgrade only.

## What will change

### 1. Establish a consistent interaction system
- Keep the current emerald, gold, charcoal, off-white tokens and current font families and sizes unchanged.
- Standardize corner treatment, subtle depth, focus rings, transition timing, press feedback, image zoom, and reduced-motion behavior through shared styles.
- Refine surfaces with restrained contrast and separation rather than adding more green or decorative effects.

### 2. Polish shared navigation and controls
- Refine the sticky header, desktop navigation, search trigger and overlay, location control, account controls, footer, and mobile bottom navigation.
- Preserve every existing link, active state, accessibility label, city preference, search shortcut, admin gate, and same-page scroll behavior.
- Improve touch targets and pressed/selected feedback without changing control sizes or labels.

### 3. Upgrade cards and featured imagery
- Improve existing movie, listing, cinema, search-result, and showtime cards using the current artwork and information.
- Add restrained image scaling, cinematic light/depth changes, clearer click affordance, and consistent surface hierarchy.
- Preserve card dimensions, data ordering, format badges, links, and all displayed information.

### 4. Enhance pages without restructuring them
- **Home:** polish the existing four-film hero, slider indicators, transitions, featured imagery treatment, and current content sections.
- **Cinemas and landing pages:** improve filters, tabs, nearby-cinema tiles, date selection, movie groups, and dense showtime scanning.
- **Movie and listing details:** refine hero/poster presentation, information grouping, date/filter controls, and booking prominence while preserving exact booking behavior.
- **Events, search, auth, legal, admin, and SEO health:** apply the same visual language to their current content and states without introducing or restoring features.

### 5. Refine motion and states
- Add fast, cinematic entrance, hover, press, carousel, overlay, and toast motion using lightweight CSS.
- Respect reduced-motion preferences and avoid continuous effects beyond the existing slider/marquee behavior.
- Replace generic loading presentation with branded skeleton treatment only where loading already exists; polish existing empty and error states without changing their wording or logic.

### 6. Validate the full application
- Check every content route and all existing interactions, including navigation, search, filters, tabs, location sorting, auth/admin visibility, internal links, and external showtime links.
- Check desktop and mobile layouts for overflow, text collision, touch usability, and preserved functionality.
- Confirm every content route retains complete unique metadata and resolve any existing metadata omissions without changing page content.

## Technical guardrails
- Styling-only changes remain in shared tokens, shared UI primitives, and presentation classes wherever possible.
- Do not alter loaders, database calls, scraper/API code, URL parameters, route definitions, ranking/de-duplication, date logic, geolocation logic, authentication/authorization, or booking URL resolution.
- Preserve SSR-visible film content, structured data, accessibility semantics, target/rel attributes on external bookings, theme initialization, and mobile safe-area behavior.
- Use existing image assets and lazy-loading behavior; no new heavy graphics or animation dependency.
