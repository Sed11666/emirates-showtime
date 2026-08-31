/**
 * Route "/privacy" — privacy policy.
 *
 * Written against what the code actually does, not from a template. Every
 * claim below is checkable in this repo:
 *
 *   storage keys   useTheme.tsx, useUserLocation.tsx, auth-prompt.tsx
 *   location       useUserLocation.tsx — coords are read, cached in
 *                  localStorage and used for distance sorting. Nothing sends
 *                  them anywhere: grep for `coords` and no fetch, insert or
 *                  RPC carries them.
 *   accounts       auth-panel.tsx — Supabase email/password and Google OAuth
 *   alerts         notify_subscribers — user_id, email, created_at
 *   analytics      <Analytics /> from @vercel/analytics in __root.tsx
 *   third parties  the hosts the browser is actually asked to contact,
 *                  including Google Fonts, which is easy to forget
 *
 * If any of those change, change this page in the same commit. A privacy
 * policy that drifts from the code is worse than none, because it is a
 * statement someone is entitled to rely on.
 */
import { createFileRoute } from "@tanstack/react-router";

import { KeyPoints, Lead, LegalPage, Points, Section } from "@/components/legal-page";

const UPDATED = "29 August 2026";
const CONTACT = "Helpshowsouk@gmail.com";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | ShowSouk" },
      {
        name: "description",
        content:
          "What ShowSouk collects and what it does not. No payments, no ad tracking, and your location never leaves your device.",
      },
      { property: "og:title", content: "Privacy Policy — ShowSouk" },
      { property: "og:url", content: "https://www.showsouk.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://www.showsouk.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>

      <KeyPoints title="The short version">
          <li>We never sell tickets and never take payment, so we hold no card details.</li>
          <li>You can use every part of this site without an account.</li>
          <li>Your location is used on your device and is never sent to us.</li>
          <li>We do not sell your data and run no advertising or cross-site tracking.</li>
      </KeyPoints>

      <Section title="What we collect">
        <p>
          <Lead>Nothing, unless you choose to give it.</Lead>{" "}
          Browsing films, showtimes, cinemas and cities requires no account and no personal
          details.
        </p>
        <p>
          <Lead>An account, if you create one.</Lead> Signing up
          stores your email address, and a password you choose, with our authentication
          provider. If you sign in with Google instead, Google tells us your email address and
          nothing else. An account is needed for exactly one feature — release alerts.
        </p>
        <p>
          <Lead>Release alerts.</Lead> If you ask to be told
          about new films, we store your account id, your email address and the date you asked.
          That is the whole record.
        </p>
      </Section>

      <Section title="Your location">
        <p>
          Showtimes are ordered nearest-first, which needs to know roughly where you are. This
          only happens when you press <em>Use my location</em> and your browser asks your
          permission — we never request it silently.
        </p>
        <p>
          <Lead>Your coordinates stay on your device.</Lead> They
          are held in your browser&rsquo;s local storage for 30 minutes so we do not have to keep
          asking, and the sorting happens in your browser. They are never transmitted to us and
          never stored on our servers.
        </p>
        <p>
          Decline, and the site orders cinemas from the centre of whichever emirate you pick in
          the header instead. Everything still works.
        </p>
      </Section>

      <Section title="What we keep in your browser">
        <p>
          We use local storage rather than tracking cookies. Four small values, all readable and
          clearable from your browser settings:
        </p>
        <Points>
          <li>your appearance choice — light, dark or system</li>
          <li>the emirate you selected</li>
          <li>your last known coordinates, for 30 minutes, as described above</li>
          <li>
            a note of what you were doing if you were asked to sign in, so you can carry on
            afterwards
          </li>
        </Points>
        <p>None of these identify you, and none are shared with anyone.</p>
      </Section>

      <Section title="Analytics">
        <p>
          We use Vercel Web Analytics to count page views and see which pages are used, and Vercel
          Speed Insights to measure how quickly pages load and respond for real visitors. Both are
          cookie-free, report in aggregate, and do not follow you to other websites or build a
          profile of you.
        </p>
      </Section>

      <Section title="Who else your browser talks to">
        <p>Loading a page on ShowSouk asks your browser to contact:</p>
        <Points>
          <li>
            <Lead>Supabase</Lead> — our database and sign-in
          </li>
          <li>
            <Lead>Vercel</Lead> — hosting, and the analytics
            described above
          </li>
          <li>
            <Lead>image.tmdb.org and cinema.aptrixx.com</Lead> —
            film posters and artwork
          </li>
          <li>
            <Lead>Google Fonts</Lead> — the typefaces this site
            uses
          </li>
        </Points>
        <p>
          Each of those sees your IP address, as any web request requires. We share nothing with
          them beyond what making the request necessarily reveals.
        </p>
      </Section>

      <Section title="When you click a showtime">
        <p>
          Booking happens on the cinema&rsquo;s own website, not here. Clicking a time takes you
          to VOX, Star, Novo, Roxy, Reel, Cinema City or Cine Royal, and from that point their
          privacy policy applies rather than ours. We are not told whether you booked, what you
          paid, or which seat you chose.
        </p>
      </Section>

      <Section title="What we never do">
        <Points>
          <li>Take payments or store card details — we sell nothing</li>
          <li>Sell, rent or trade your personal data</li>
          <li>Run advertising networks, retargeting, or third-party tracking pixels</li>
          <li>Follow you across other websites</li>
          <li>Ask for your name, phone number, address or date of birth</li>
        </Points>
      </Section>

      <Section title="Your choices">
        <p>
          You can browse without an account, decline the location prompt, and clear everything
          this site has stored by clearing site data in your browser.
        </p>
        <p>
          To see what we hold, correct it, stop release alerts, or delete your account and its
          data entirely, email{" "}
          <a href={`mailto:${CONTACT}`} className="text-gold hover:brightness-125">
            {CONTACT}
          </a>
          . Deletion requests are actioned within 30 days.
        </p>
      </Section>

      <Section title="Children">
        <p>
          ShowSouk is a listings service for a general audience and is not directed at children.
          We do not knowingly collect personal data from anyone under 18. If you believe a child
          has created an account, contact us and we will remove it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If what we collect changes, this page changes with it and the date at the top is
          updated. Material changes will be summarised here rather than made quietly.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or about your data:{" "}
          <a href={`mailto:${CONTACT}`} className="text-gold hover:brightness-125">
            {CONTACT}
          </a>
        </p>
      </Section>

    </LegalPage>
  );
}
