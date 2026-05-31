import React, { useEffect, useId, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { getMermaidConfig } from './mermaid-config'
import { renderMermaidSvg } from '../architecture/mermaid-render-queue'

type MermaidBlockProps = {
  content: string
  isDark: boolean
  htmlLabels?: boolean
}

/**
 * Renders a mermaid diagram string as SVG. Falls back to raw source with an
 * error banner if the syntax is invalid — never breaks the rest of the preview.
 */
export default function MermaidBlock({
  content,
  isDark,
  htmlLabels = false
}: MermaidBlockProps): React.JSX.Element {
  const id = useId().replace(/:/g, '_')
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const render = async (): Promise<void> => {
      try {
        // Why: Mermaid stores initialize() config in global module state. Apply
        // the config inside the same serialized render task so another
        // MermaidBlock cannot overwrite htmlLabels/theme between initialize()
        // and render(), which would make markdown preview fall back to the
        // broken foreignObject label path again.
        const svg = await renderMermaidSvg(
          `mermaid-${id}`,
          content,
          getMermaidConfig(isDark, htmlLabels)
        )
        if (!cancelled && containerRef.current) {
          // Why: although mermaid uses DOMPurify internally, we add an explicit
          // sanitization pass as defense-in-depth against XSS in case upstream
          // behaviour changes or a mermaid version ships without sanitization.
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true }
          })
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid mermaid syntax')
          // Mermaid leaves an error element in the DOM on failure — clean it up.
          const errorEl = document.getElementById(`d${`mermaid-${id}`}`)
          errorEl?.remove()
        }
      }
    }

    // Serialize render calls through the shared queue to avoid race conditions
    // from concurrent mermaid.render() invocations.
    void render()
    return () => {
      cancelled = true
    }
  }, [content, htmlLabels, isDark, id])

  if (error) {
    return (
      <div className="mermaid-block">
        <div className="mermaid-error">Diagram error: {error}</div>
        <pre>
          <code>{content}</code>
        </pre>
      </div>
    )
  }

  return <div className="mermaid-block" ref={containerRef} />
}
