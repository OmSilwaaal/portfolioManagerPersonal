import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { setIsPro } from '../store/preferencesSlice'
import { supabase } from '../utils/supabase/client'

const PRO_PRICE = '$12'

const FREE_FEATURES = [
  '5 feed items per day',
  'Basic stock prices & change %',
  'BTC & ETH crypto prices',
  '5 government trades',
  '3 commodity prices',
]

const PRO_FEATURES = [
  'Unlimited personalized feed',
  'Full stock charts & AI news',
  'All 4 crypto assets with charts',
  'All government trades + filters',
  'All commodities with AI context',
  'Unlimited price alerts',
  'Priority support',
]

function Check({ pro }) {
  if (pro) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

export default function Pricing() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const isPro = useSelector((state) => state.preferences.isPro)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeSuccess, setCodeSuccess] = useState(false)
  const [applying, setApplying] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const handleStripeCheckout = async () => {
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
      const res = await fetch(`${apiBase}/stripe/pro-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      })
      const body = await res.json()
      if (!res.ok || !body.url) {
        setCheckoutError(body.message || 'Could not start checkout. Please try again.')
        return
      }
      window.location.href = body.url
    } catch {
      setCheckoutError('Could not connect to payment server. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleApplyCode = async (e) => {
    e.preventDefault()
    setCodeError('')
    setApplying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
      const res = await fetch(`${apiBase}/stripe/redeem-code`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCodeError(body.message || 'Something went wrong. Please try again.')
        setApplying(false)
        return
      }
      await supabase.auth.refreshSession()
      dispatch(setIsPro(true))
      setCodeSuccess(true)
    } catch {
      setCodeError('Could not connect to server. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <main className="flex-1 p-5 md:p-8 max-w-3xl mx-auto w-full">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
            <path d="M5 20h14"/>
          </svg>
          Travauxus Pro
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          {isPro ? 'You\'re on Pro' : 'Upgrade your intelligence'}
        </h1>
        <p className="text-[#6b7280] text-base">
          {isPro
            ? 'You have full access to all Travauxus Pro features.'
            : 'Get unlimited access to AI summaries, full charts, government trades, and more.'}
        </p>
      </div>

      {isPro ? (
        <div className="bg-[#141414] border border-[#f59e0b]/30 rounded-2xl p-8 text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l3 12h14l3-12-6 5-4-5-4 5-6-5z"/>
              <path d="M5 20h14"/>
            </svg>
          </div>
          <p className="text-white font-bold text-xl mb-2">Pro Member</p>
          <p className="text-[#6b7280] text-sm mb-6">You have access to all features.</p>
          <button
            onClick={() => navigate('/feed')}
            className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0a0a0a] font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Go to Feed
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Free plan */}
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
            <div className="mb-5">
              <p className="text-[#a1a1aa] text-sm font-semibold uppercase tracking-wide mb-2">Free</p>
              <p className="text-3xl font-bold text-white">$0</p>
              <p className="text-[#6b7280] text-sm mt-1">Current plan</p>
            </div>
            <ul className="space-y-2.5 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#a1a1aa]">
                  <Check pro={false} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="w-full text-center text-[#6b7280] text-sm font-medium py-2.5 rounded-xl border border-[#2a2a2a]">
              Current plan
            </div>
          </div>

          {/* Pro plan */}
          <div className="bg-[#141414] border border-[#f59e0b]/40 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[#f59e0b] text-[#0a0a0a] text-[10px] font-black px-3 py-1 rounded-bl-xl tracking-wide">
              RECOMMENDED
            </div>
            <div className="mb-5">
              <p className="text-[#f59e0b] text-sm font-semibold uppercase tracking-wide mb-2">Pro</p>
              <div className="flex items-baseline gap-1">
                <p className="text-3xl font-bold text-white">{PRO_PRICE}</p>
                <p className="text-[#6b7280] text-sm">/month</p>
              </div>
              <p className="text-[#6b7280] text-sm mt-1">Full access, cancel anytime</p>
            </div>
            <ul className="space-y-2.5 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white">
                  <Check pro={true} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="w-full bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 text-[#0a0a0a] text-sm font-bold py-3 rounded-xl transition-colors"
              onClick={handleStripeCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Redirecting…' : `Get Pro — ${PRO_PRICE}/mo`}
            </button>
            {checkoutError && <p className="text-red-400 text-xs text-center mt-2">{checkoutError}</p>}
          </div>
        </div>
      )}

      {/* Promo code section */}
      {!isPro && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
          <button
            onClick={() => setShowCode(!showCode)}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <p className="text-white font-semibold text-sm">Have a promo code?</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Enter your code to unlock Pro access instantly</p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6b7280"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showCode ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showCode && (
            <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
              {codeSuccess ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Pro unlocked!</p>
                    <p className="text-[#6b7280] text-sm mt-1">You now have full access to Travauxus Pro.</p>
                  </div>
                  <button
                    onClick={() => navigate('/feed')}
                    className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0a0a0a] text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
                  >
                    Go to Feed
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCode} className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError('') }}
                    placeholder="Enter promo code"
                    className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#f59e0b] text-white placeholder-[#6b7280] text-sm rounded-xl px-4 py-2.5 focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={applying || !code.trim()}
                    className="bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 text-[#0a0a0a] text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    {applying ? '…' : 'Apply'}
                  </button>
                </form>
              )}
              {codeError && (
                <p className="text-red-400 text-xs mt-2">{codeError}</p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[#4b5563] text-xs text-center mt-8">
        Not financial advice. Travauxus is for educational purposes only.
      </p>
    </main>
  )
}
