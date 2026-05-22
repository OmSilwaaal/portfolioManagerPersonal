export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: { icon: 22, text: 'text-sm' },
    md: { icon: 26, text: 'text-base' },
    lg: { icon: 30, text: 'text-lg' },
  }
  const { icon, text } = sizes[size] || sizes.md

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer diamond */}
        <path
          d="M12 2L22 12L12 22L2 12Z"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Inner diamond */}
        <path
          d="M12 6.5L17.5 12L12 17.5L6.5 12Z"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-semibold text-white tracking-tight ${text}`}>
        Travauxus
      </span>
    </div>
  )
}
