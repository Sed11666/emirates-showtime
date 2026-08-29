/**
 * Route "/terms" — terms of service.
 *
 * Written against how the product actually behaves. The clauses that matter
 * here are not the boilerplate ones:
 *
 *   Accuracy      showtimes are scraped from cinemauae.com and Reel's own
 *                 feed on a ~15 minute cron, a full pass taking ~4 hours, so
 *                 the data is periodically refreshed rather than live. A
 *                 cinema can change a schedule at any time and we will not
 *                 know until the next pass. This is the single most likely
 *                 way a visitor is inconvenienced, so it is stated first and
 *                 plainly rather than buried.
 *   No booking    we hold no seat, take no payment and receive no order. The
 *                 hand-off is a link; the contract is with the cinema.
 *   TMDB          their API terms require this acknowledgement. It is also in
 *                 the footer, because that is where it is actually visible.
 *
 * NOT reviewed by a lawyer. It is an accurate description of how the service
 * works, which is the prerequisite for a lawyer to review it cheaply.
 */
import { createFileRoute } from "@tanstack/react-router";

import { KeyPoints, Lead, LegalPage, Points, Section } from "@/components/legal-page";

const UPDATED = "29 August 2026";
const CONTACT = "Helpshowsouk@gmail.com";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | ShowSouk" },
      {
        name: "description",
        content:
          "The terms for using ShowSouk. We list UAE cinema showtimes and link you to the cinema to book — we never sell tickets or hold a seat.",
      },
      { property: "og:title", content: "Terms of Service — ShowSouk" },
      { property: "og:url", content: "https://www.showsouk.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://www.showsouk.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <KeyPoints title="The short version">
        <li>We list showtimes and link you to the cinema. We never sell tickets.</li>
        <li>Showtimes come from third parties and can be out of date — always check with the cinema before you travel.</li>
        <li>Your booking, payment and refund are entirely with the cinema, not with us.</li>
        <li>The service is free and provided as is.</li>
      </KeyPoints>

      <Section title="1. What ShowSouk is">
        <p>
          ShowSouk lists films showing at cinemas across the UAE and links each showtime to the
          cinema&rsquo;s own booking page. That is the whole of the service.
        </p>
        <p>
          <Lead>We are not a ticket seller, agent or reseller.</Lead> We hold no seats, process
          no payments and receive no orders. Using this site does not create any booking or
          reservation of any kind.
        </p>
        <p>By using the site you accept these terms. If you do not accept them, do not use it.</p>
      </Section>

      <Section title="2. Showtimes may be inaccurate or out of date">
        <p>
          Showtime, venue, format and pricing information is compiled automatically from
          publicly available sources, including the cinemas&rsquo; own published data. It is
          refreshed periodically rather than in real time, so there is always a window in which
          what you see here differs from what the cinema is actually showing.
        </p>
        <p>
          Cinemas add, move, reschedule and cancel screenings without notice, and they are under
          no obligation to tell us. Sold-out screenings may still appear listed.
        </p>
        <p>
          <Lead>
            Always confirm the film, date, time and venue on the cinema&rsquo;s own website
            before travelling or making plans.
          </Lead>{" "}
          We give no warranty that any listing is accurate, complete or current, and we are not
          responsible for a wasted journey, a missed screening or any other loss arising from
          relying on a listing.
        </p>
      </Section>

      <Section title="3. Booking is between you and the cinema">
        <p>
          Clicking a showtime takes you to a third-party website operated by VOX, Star, Novo,
          Roxy, Reel, Cinema City or Cine Royal. Everything from that point — the price you pay,
          the seat you get, the terms you agree to, and any refund, exchange or cancellation —
          is a matter between you and that cinema under their terms.
        </p>
        <p>
          We do not control those sites, are not responsible for their content or availability,
          and receive no information about what you book. Complaints about a booking must go to
          the cinema.
        </p>
        <p>
          Where a cinema publishes no link to a specific screening, we say so on the showtime
          itself and send you to their booking page instead. That marking is a convenience, not
          a guarantee about where the link lands.
        </p>
      </Section>

      <Section title="4. Accounts">
        <p>
          You can use the entire site without an account. One is needed only for release alerts.
        </p>
        <p>
          Keep your sign-in details secure; you are responsible for activity under your account.
          Give accurate details, and do not impersonate anyone or create an account on someone
          else&rsquo;s behalf without permission.
        </p>
        <p>
          We may suspend or remove an account that is used to abuse the service or to break
          these terms. You can ask us to delete your account at any time — see the{" "}
          <a href="/privacy" className="text-gold hover:brightness-125">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>The site is for personal, non-commercial use. Please do not:</p>
        <Points>
          <li>
            scrape, crawl or bulk-extract listings, or republish or resell our compiled data
          </li>
          <li>use automated tools in a way that degrades the service for others</li>
          <li>attempt to gain unauthorised access to any part of the site or its data</li>
          <li>copy the site&rsquo;s design, code or branding</li>
          <li>use the site for anything unlawful</li>
        </Points>
        <p>
          Linking to us is welcome. If you want to use our data for something else, ask at{" "}
          <a href={`mailto:${CONTACT}`} className="text-gold hover:brightness-125">
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="6. Content and attribution">
        <p>
          Film titles, posters, artwork, trailers and synopses are the property of their
          respective owners — studios, distributors and the cinemas — and appear here to
          identify the films being listed. We claim no ownership of them.
        </p>
        <p>
          <Lead>This product uses the TMDB API but is not endorsed or certified by TMDB.</Lead>
        </p>
        <p>
          Cinema and chain names and logos are the trademarks of their owners. ShowSouk is not
          affiliated with, endorsed by or acting on behalf of any cinema chain.
        </p>
        <p>
          The site&rsquo;s own design, code and compiled presentation are ours and may not be
          reproduced without permission.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          The service is free and offered without any guarantee of uptime. We may change,
          suspend or discontinue any part of it, including features and listings, at any time
          and without notice.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          The site is provided <Lead>as is</Lead> and without warranties of any kind, express or
          implied, including as to accuracy, availability or fitness for a particular purpose.
        </p>
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect or
          consequential loss, or for any loss arising from inaccurate listings, an unavailable
          service, or your dealings with a cinema. Nothing here limits liability that cannot
          lawfully be limited.
        </p>
      </Section>

      <Section title="9. Changes to these terms">
        <p>
          These terms may change. The date at the top shows when they last did, and continuing
          to use the site after a change means you accept the revised version.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These terms are governed by the laws of the United Arab Emirates, and the courts of
          the UAE have exclusive jurisdiction over any dispute arising from them.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${CONTACT}`} className="text-gold hover:brightness-125">
            {CONTACT}
          </a>
        </p>
      </Section>
    </LegalPage>
  );
}
