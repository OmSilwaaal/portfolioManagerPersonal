import { useState } from 'react'
import { useGetAlertsQuery, useCreateAlertMutation, useDeleteAlertMutation } from '../api/alertsApi'

function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function Alerts() {
  const { data, isLoading: alertsLoading, isError: alertsError } = useGetAlertsQuery()
  const [createAlert, { isLoading: creating, error: createError }] = useCreateAlertMutation()
  const [deleteAlert] = useDeleteAlertMutation()

  const [form, setForm] = useState({ ticker: '', targetPrice: '', direction: 'above' })
  const [formError, setFormError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccessMsg('')

    const { ticker, targetPrice, direction } = form
    if (!ticker.trim()) return setFormError('Ticker is required.')
    const price = parseFloat(targetPrice)
    if (!targetPrice || isNaN(price) || price <= 0) return setFormError('Enter a valid positive price.')

    try {
      await createAlert({
        ticker: ticker.trim().toUpperCase(),
        targetPrice: price,
        direction,
      }).unwrap()
      setForm({ ticker: '', targetPrice: '', direction: 'above' })
      setSuccessMsg('Alert created successfully.')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setFormError(err?.data?.message || 'Failed to create alert.')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAlert(id).unwrap()
    } catch {
      // silent — list will not refresh if delete fails, which is acceptable
    }
  }

  const alerts = data?.alerts || []

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb]">
        <div>
          <h1 className="text-xl font-semibold text-white dark:text-white text-[#0f0f0f]">Alerts</h1>
          <p className="text-sm text-[#a1a1aa]">Set price alerts for stocks and crypto</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-xl mx-auto space-y-6">
          {/* Create alert form */}
          <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
            <h2 className="text-sm font-semibold text-white dark:text-white text-[#0f0f0f] mb-4">
              Create Price Alert
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#a1a1aa] mb-1.5">Ticker</label>
                  <input
                    type="text"
                    value={form.ticker}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                    placeholder="e.g. AAPL"
                    maxLength={10}
                    className="w-full px-3 py-2 text-sm bg-[#0f0f0f] dark:bg-[#0f0f0f] bg-white text-white dark:text-white text-[#0f0f0f] placeholder-[#6b7280] border border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] rounded-md focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#a1a1aa] mb-1.5">Target Price ($)</label>
                  <input
                    type="number"
                    value={form.targetPrice}
                    onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
                    placeholder="e.g. 200.00"
                    min="0.01"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm bg-[#0f0f0f] dark:bg-[#0f0f0f] bg-white text-white dark:text-white text-[#0f0f0f] placeholder-[#6b7280] border border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] rounded-md focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#a1a1aa] mb-1.5">Direction</label>
                  <select
                    value={form.direction}
                    onChange={(e) => setForm({ ...form, direction: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#0f0f0f] dark:bg-[#0f0f0f] bg-white text-white dark:text-white text-[#0f0f0f] border border-[#1f1f1f] dark:border-[#1f1f1f] border-[#e5e7eb] rounded-md focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
                  >
                    <option value="above">Rises above</option>
                    <option value="below">Falls below</option>
                  </select>
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-500">{formError}</p>
              )}
              {createError && (
                <p className="text-sm text-red-500">
                  {createError?.data?.message || 'Failed to create alert.'}
                </p>
              )}
              {successMsg && (
                <p className="text-sm text-green-400">{successMsg}</p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 bg-[#3b82f6] text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Alert'}
              </button>
            </form>
          </div>

          {/* Active alerts list */}
          <div>
            <h2 className="text-base font-semibold text-white dark:text-white text-[#0f0f0f] mb-4">
              Active Alerts
            </h2>

            {alertsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md animate-pulse"
                  >
                    <div className="h-4 bg-[#1f1f1f] rounded w-1/3" />
                  </div>
                ))}
              </div>
            )}

            {alertsError && (
              <div className="p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md">
                <p className="text-sm text-[#a1a1aa]">Unable to load alerts. Make sure the backend is running.</p>
              </div>
            )}

            {!alertsLoading && !alertsError && alerts.length === 0 && (
              <div className="p-6 bg-surface dark:bg-surface bg-[#f9f9f9] border border-border-subtle dark:border-border-subtle border-[#e5e7eb] rounded-md text-center">
                <p className="text-[#a1a1aa] text-sm">No active alerts. Create one above.</p>
              </div>
            )}

            {!alertsLoading && alerts.length > 0 && (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-4 bg-surface dark:bg-surface bg-[#f9f9f9] border rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${
                      alert.triggered
                        ? 'border-green-400/40'
                        : 'border-border-subtle dark:border-border-subtle border-[#e5e7eb]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-medium text-white dark:text-white text-[#0f0f0f]">
                        {alert.ticker}
                      </span>
                      <span className="text-sm text-[#a1a1aa]">
                        {alert.direction === 'above' ? 'rises above' : 'falls below'}
                      </span>
                      <span className="text-sm font-medium text-white dark:text-white text-[#0f0f0f]">
                        ${alert.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {alert.triggered && (
                        <span className="text-xs text-green-400 font-medium">Triggered</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#6b7280]">
                        {timeAgo(alert.createdAt)}
                      </span>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="text-[#6b7280] hover:text-red-500 transition-colors text-sm"
                        title="Delete alert"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
