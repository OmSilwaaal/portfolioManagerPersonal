export default function Card({ children, className = '', onClick, hoverable = false }) {
  const base = 'bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl'
  const hover = hoverable
    ? 'transition-all hover:border-[#2a2a2a] hover:bg-[#141414] cursor-pointer'
    : ''

  return (
    <div className={`${base} ${hover} ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}
