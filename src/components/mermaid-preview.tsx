"use client"

import { useEffect, useState } from "react"
import mermaid from "mermaid"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
})

export function MermaidPreview({
  chart,
  className,
}: {
  chart: string
  className?: string
}) {
  const [svg, setSvg] = useState<string>("")

  useEffect(() => {
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
    mermaid
      .render(id, chart)
      .then(({ svg }) => setSvg(svg))
      .catch((err) => {
        console.error("Mermaid render failed:", err)
        setSvg("")
      })
  }, [chart])

  if (!svg) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm p-4">
        Rendering diagram...
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center overflow-auto ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
