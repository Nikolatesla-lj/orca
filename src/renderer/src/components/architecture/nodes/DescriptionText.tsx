import type { ReactNode } from 'react'

const REF_RE = /@\[([^\]]+)\]/g

function parseRefs(text: string, onMentionClick?: (name: string) => void): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(REF_RE)) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const name = match[1]
    parts.push(
      <span
        key={key++}
        className={`inline-flex items-baseline rounded bg-muted px-1 font-mono text-[0.85em] font-medium text-muted-foreground ${
          onMentionClick ? 'cursor-pointer hover:bg-accent hover:text-foreground' : ''
        }`}
        onClick={
          onMentionClick
            ? (event) => {
                event.stopPropagation()
                onMentionClick(name)
              }
            : undefined
        }
      >
        {name.length > 30 ? `${name.slice(0, 30)}...` : name}
      </span>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push(text.slice(last))
  }
  return parts
}

export function DescriptionText({
  text,
  onMentionClick
}: {
  text: string
  onMentionClick?: (name: string) => void
}): React.JSX.Element {
  const lines = text.split('\n')
  const isList = lines.some((line) => /^[-*]\s/.test(line.trimStart()))
  if (!isList) {
    return (
      <span className="block break-words overflow-hidden">{parseRefs(text, onMentionClick)}</span>
    )
  }

  return (
    <ul className="w-full space-y-0.5 pl-3 text-left">
      {lines.map((line, index) => {
        const trimmed = line.trimStart()
        const bullet = /^[-*]\s/.test(trimmed)
        if (!trimmed) {
          return null
        }
        return (
          <li key={`${line}-${index}`} className={bullet ? 'list-disc' : 'list-none'}>
            {parseRefs(bullet ? trimmed.slice(2) : trimmed, onMentionClick)}
          </li>
        )
      })}
    </ul>
  )
}
