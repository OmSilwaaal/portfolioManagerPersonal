export default function QuizQuestion({ question, options, type, onAnswer, selected }) {
  const isSelected = (value) => {
    if (type === 'single') return selected === value
    return Array.isArray(selected) && selected.includes(value)
  }

  const handleSelect = (value) => {
    if (type === 'single') {
      onAnswer(value)
    } else {
      const current = Array.isArray(selected) ? selected : []
      if (current.includes(value)) {
        onAnswer(current.filter((v) => v !== value))
      } else {
        onAnswer([...current, value])
      }
    }
  }

  return (
    <div className="w-full max-w-xl">
      <h2 className="text-3xl font-semibold text-white mb-8 text-center leading-tight">
        {question}
      </h2>
      <div className="flex flex-col gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className={`w-full text-left px-6 py-4 rounded-lg border text-base font-medium transition-all duration-150 ${
              isSelected(option.value)
                ? 'bg-[#3b82f6] border-[#3b82f6] text-white'
                : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:border-[#3b82f6] hover:text-white'
            }`}
          >
            {type === 'multi' && (
              <span
                className={`inline-block w-4 h-4 border rounded mr-3 align-middle ${
                  isSelected(option.value) ? 'bg-white border-white' : 'border-gray-500'
                }`}
              />
            )}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
