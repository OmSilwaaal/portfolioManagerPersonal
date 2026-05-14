import { useState } from 'react'
import { jargonMap } from '../utils/jargonMap'

export default function JargonTooltip({ children, term }) {
  const [visible, setVisible] = useState(false)
  const definition = term ? jargonMap[term] : null

  if (!definition) {
    return <>{children}</>
  }

  return (
    <span className="relative inline">
      <span
        className="underline decoration-dotted decoration-[#a1a1aa] cursor-help"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
      >
        {children}
      </span>
      {visible && (
        <span
          className="absolute z-50 bottom-full left-0 mb-1 w-56 p-2 text-xs rounded-md
            bg-[#1f1f1f] dark:bg-[#1f1f1f] text-[#ffffff] dark:text-white
            border border-[#2a2a2a] shadow-[0_1px_3px_rgba(0,0,0,0.3)]
            pointer-events-none"
        >
          <span className="font-medium text-[#3b82f6]">{term}</span>
          <br />
          {definition}
        </span>
      )}
    </span>
  )
}
