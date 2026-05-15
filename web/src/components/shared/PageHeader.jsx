export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="px-6 py-6 border-b border-[#1f1f1f] flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[#6b7280] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center">{action}</div>
      )}
    </div>
  )
}
