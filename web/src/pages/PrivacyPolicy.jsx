import { Link } from 'react-router-dom'

const INK  = '#0b0b0b'
const CREAM = 'var(--paper)'
const BORDER = 'rgba(240,235,224,0.10)'

const UPDATED = 'May 28, 2026'

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.38)', marginBottom: 16, fontWeight: 500 }}>
        {title}
      </h2>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.85, color: 'rgba(240,235,224,0.68)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </section>
  )
}

function P({ children }) {
  return <p style={{ margin: 0 }}>{children}</p>
}

function UL({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ paddingLeft: 4 }}>{item}</li>
      ))}
    </ul>
  )
}

export default function PrivacyPolicy() {
  return (
    <div style={{ background: INK, minHeight: '100vh', color: CREAM }}>
      {/* Nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, background: INK, padding: '0 clamp(20px,6vw,80px)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L22 12L12 22L2 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: CREAM, fontSize: 15 }}>Travauxus</span>
          </Link>
          <Link to="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.36)', textDecoration: 'none' }}>
            ← Back
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(48px,8vw,96px) clamp(20px,6vw,80px)' }}>
        {/* Header */}
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.36)', marginBottom: 16 }}>
            Legal · Privacy
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(32px,5vw,60px)', letterSpacing: '-0.04em', lineHeight: 0.9, color: CREAM, margin: '0 0 24px' }}>
            Privacy Policy
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.36)', marginBottom: 0 }}>
            Last updated: {UPDATED}
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 48 }}>
          <Section title="Overview">
            <P>
              Travauxus ("we", "our", or "us") operates the Travauxus platform — an AI-powered market intelligence feed available at travauxus.com. This Privacy Policy explains what information we collect, why we collect it, and how we use it.
            </P>
            <P>
              By using Travauxus you agree to the collection and use of information in accordance with this policy. If you disagree with any part, please do not use our service.
            </P>
          </Section>

          <Section title="Information We Collect">
            <P>We collect only what we need to operate the service:</P>
            <UL items={[
              'Email address — used to create your account and send magic-link sign-in emails.',
              'Display name — the name you provide during onboarding, stored in your profile.',
              'Preferences — investor type, risk tolerance, watchlist tickers, and notification settings you configure during and after onboarding.',
              'Usage data — pages visited, features used, and interaction events collected anonymously via server logs.',
              'OAuth data — if you sign in with Google, we receive your name, email, and profile picture from Google. We do not receive your Google password.',
            ]} />
          </Section>

          <Section title="How We Use Your Information">
            <UL items={[
              'To authenticate your account and keep it secure.',
              'To personalise your news feed, watchlist, and alerts based on your preferences.',
              'To send transactional emails (magic-link sign-ins, price alert notifications).',
              'To improve the product — we analyse aggregated, anonymised usage patterns.',
              'We do not sell your personal data. We do not use your data to train AI models.',
            ]} />
          </Section>

          <Section title="Data Storage & Security">
            <P>
              Your account data is stored via Supabase (a Postgres-based cloud database hosted on AWS). Authentication tokens are stored in your browser's local storage and managed by the Supabase client SDK.
            </P>
            <P>
              We take reasonable precautions to protect your data, but no transmission over the internet is completely secure. Use of this service is at your own risk.
            </P>
          </Section>

          <Section title="Third-Party Services">
            <P>We use the following third-party services that may process your data:</P>
            <UL items={[
              'Supabase — authentication and database (supabase.com/privacy)',
              'Google OAuth — optional sign-in method (policies.google.com/privacy)',
              'Stripe — payment processing for Pro subscriptions (stripe.com/privacy)',
              'Vercel — hosting and edge network (vercel.com/legal/privacy-policy)',
            ]} />
            <P>We do not share your personal information with any other third parties unless required by law.</P>
          </Section>

          <Section title="Cookies & Local Storage">
            <P>
              Travauxus does not use tracking cookies. We use browser localStorage and sessionStorage strictly to maintain your session and remember UI state (e.g. whether the intro animation has played). No third-party ad or analytics cookies are set.
            </P>
          </Section>

          <Section title="Data Retention">
            <P>
              We retain your account data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us at the address below. Upon deletion, your personal data is removed within 30 days.
            </P>
          </Section>

          <Section title="Your Rights">
            <P>Depending on your location you may have the right to:</P>
            <UL items={[
              'Access the personal data we hold about you.',
              'Correct inaccurate data.',
              'Request deletion of your data.',
              'Object to or restrict certain processing.',
              'Data portability — receive a copy of your data in a structured format.',
            ]} />
            <P>To exercise any of these rights, contact us at the address below.</P>
          </Section>

          <Section title="Not Financial Advice">
            <P>
              Travauxus is an informational platform only. Nothing on this site constitutes financial, investment, legal, or tax advice. Past performance does not indicate future results. Always consult a qualified financial advisor before making investment decisions.
            </P>
          </Section>

          <Section title="Children's Privacy">
            <P>
              Travauxus is not directed to anyone under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal data, contact us and we will delete it promptly.
            </P>
          </Section>

          <Section title="Changes to This Policy">
            <P>
              We may update this policy from time to time. When we do, we will update the "Last updated" date at the top of this page. Continued use of the service after changes are posted constitutes acceptance of the updated policy.
            </P>
          </Section>

          <Section title="Contact">
            <P>
              Questions about this policy? Reach us at:{' '}
              <a href="mailto:poperwagger@gmail.com" style={{ color: CREAM, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                poperwagger@gmail.com
              </a>
            </P>
          </Section>
        </div>

        {/* Footer rule */}
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 64, paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(240,235,224,0.22)' }}>
            © {new Date().getFullYear()} TRAVAUXUS
          </span>
          <Link to="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(240,235,224,0.22)', textDecoration: 'none' }}>
            TRAVAUXUS.COM
          </Link>
        </div>
      </div>
    </div>
  )
}
