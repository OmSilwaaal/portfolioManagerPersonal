import { Link } from 'react-router-dom'

const INK   = '#0b0b0b'
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
      {items.map((item, i) => <li key={i} style={{ paddingLeft: 4 }}>{item}</li>)}
    </ul>
  )
}

export default function Terms() {
  return (
    <div style={{ background: INK, minHeight: '100vh', color: CREAM }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, background: INK, padding: '0 clamp(20px,6vw,80px)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L22 12L12 22L2 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 6.5L17.5 12L12 17.5L6.5 12Z" stroke={CREAM} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: CREAM, fontSize: 15 }}>Travauxus</span>
          </Link>
          <Link to="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.36)', textDecoration: 'none' }}>← Back</Link>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(48px,8vw,96px) clamp(20px,6vw,80px)' }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.36)', marginBottom: 16 }}>Legal · Terms</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 125, 'wght' 700", fontStretch: '125%', fontWeight: 700, fontSize: 'clamp(32px,5vw,60px)', letterSpacing: '-0.04em', lineHeight: 0.9, color: CREAM, margin: '0 0 24px' }}>
            Terms of Service
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(240,235,224,0.36)' }}>Last updated: {UPDATED}</p>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 48 }}>
          <Section title="Agreement to Terms">
            <P>By accessing or using Travauxus ("the Service") at travauxus.com, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</P>
          </Section>

          <Section title="Description of Service">
            <P>Travauxus is an informational platform providing AI-powered market intelligence, stock and crypto watchlists, government trade tracking, price alerts, and paper trading simulation. The Service is intended for educational and informational purposes only.</P>
          </Section>

          <Section title="Not Financial Advice">
            <P>Nothing on Travauxus constitutes financial, investment, legal, or tax advice. All content is for informational purposes only. Past performance of any security or strategy does not guarantee future results.</P>
            <P>You are solely responsible for your own investment decisions. Always consult a qualified financial advisor before making investment decisions.</P>
          </Section>

          <Section title="Eligibility">
            <UL items={[
              'You must be at least 18 years old to use the Service.',
              'You must provide accurate information when creating an account.',
              'You are responsible for maintaining the security of your account credentials.',
            ]} />
          </Section>

          <Section title="Acceptable Use">
            <P>You agree not to:</P>
            <UL items={[
              'Use the Service for any unlawful purpose.',
              'Attempt to reverse-engineer, scrape, or extract data from the Service at scale.',
              'Share your account credentials with others.',
              'Use the Service to manipulate or deceive other users.',
              'Attempt to gain unauthorised access to any part of the Service or its infrastructure.',
            ]} />
          </Section>

          <Section title="Pro Subscriptions">
            <P>Certain features require a paid Pro subscription, billed via Stripe. Subscriptions renew automatically unless cancelled before the renewal date. Refunds are handled on a case-by-case basis — contact us within 7 days of a charge if you believe it was made in error.</P>
            <P>Promo codes grant Pro access at our discretion and may be revoked if misused or shared publicly.</P>
          </Section>

          <Section title="Paper Trading">
            <P>The paper trading feature uses simulated currency with no real monetary value. Virtual cash purchased within the platform is for simulation purposes only and cannot be withdrawn or exchanged for real money.</P>
          </Section>

          <Section title="Intellectual Property">
            <P>All content, design, and code on Travauxus is owned by or licensed to us. You may not reproduce, distribute, or create derivative works without our written permission.</P>
          </Section>

          <Section title="Disclaimers & Limitation of Liability">
            <P>The Service is provided "as is" without warranties of any kind. We do not guarantee the accuracy, completeness, or timeliness of any market data or AI-generated content.</P>
            <P>To the maximum extent permitted by law, Travauxus and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</P>
          </Section>

          <Section title="Termination">
            <P>We reserve the right to suspend or terminate your account at any time for violation of these Terms. You may delete your account at any time via Settings or by contacting us.</P>
          </Section>

          <Section title="Governing Law">
            <P>These Terms are governed by the laws of the jurisdiction in which Travauxus operates. Any disputes shall be resolved through good-faith negotiation before any legal action is taken.</P>
          </Section>

          <Section title="Changes to These Terms">
            <P>We may update these Terms at any time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.</P>
          </Section>

          <Section title="Contact">
            <P>Questions about these Terms?{' '}
              <a href="mailto:poperwagger@gmail.com" style={{ color: CREAM, textDecoration: 'underline', textUnderlineOffset: 3 }}>poperwagger@gmail.com</a>
            </P>
          </Section>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 64, paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(240,235,224,0.22)' }}>© {new Date().getFullYear()} TRAVAUXUS</span>
          <div style={{ display: 'flex', gap: 24 }}>
            <Link to="/privacy" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(240,235,224,0.22)', textDecoration: 'none' }}>PRIVACY</Link>
            <Link to="/disclaimer" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(240,235,224,0.22)', textDecoration: 'none' }}>DISCLAIMER</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
