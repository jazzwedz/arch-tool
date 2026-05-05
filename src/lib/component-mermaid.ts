// Build small mermaid diagrams scoped to a single component's perspective.
// Used by per-section "Visualize" buttons on the detail page.

import type { Component } from "./types"
import { RELATIONSHIP_LABELS } from "./constants"

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_")
}

function escLabel(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/\n/g, " ")
}

/**
 * Visualise the component's interfaces.
 *
 * Layout: this component sits in the middle. `provides` interfaces extend
 * to "External callers" (or named target if present); `consumes` interfaces
 * point inward from "External providers" (or named target).
 */
export function buildInterfacesMermaid(component: Component): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)
  lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)

  const interfaces = component.interfaces || []
  if (interfaces.length === 0) {
    lines.push(`  noop["No interfaces defined"]:::muted`)
    lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  let counter = 0
  for (const iface of interfaces) {
    counter++
    const otherId = iface.target ? safeId(iface.target) : `caller_${counter}`
    const otherLabel = iface.target || (iface.direction === "provides" ? "External caller" : "External source")
    lines.push(`  ${otherId}["${escLabel(otherLabel)}"]:::peer`)
    const protoLabel = `${iface.type}${iface.description ? `: ${iface.description.slice(0, 40)}` : ""}`
    if (iface.direction === "provides") {
      lines.push(`  ${otherId} -->|${escLabel(protoLabel)}| ${me}`)
    } else {
      lines.push(`  ${me} -->|${escLabel(protoLabel)}| ${otherId}`)
    }
  }

  lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
  lines.push(`  classDef peer fill:#f9fafb,stroke:#6b7280,color:#374151`)
  return lines.join("\n")
}

/**
 * Visualise the component's relationships to other components in the catalog.
 * Edges are labelled with the relationship type.
 */
export function buildRelationshipsMermaid(component: Component): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)
  lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)

  const rels = component.relationships || []
  if (rels.length === 0) {
    lines.push(`  noop["No relationships defined"]:::muted`)
    lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  for (const rel of rels) {
    const otherId = safeId(rel.target)
    lines.push(`  ${otherId}["${escLabel(rel.target)}"]:::peer`)
    const label = RELATIONSHIP_LABELS[rel.type] || rel.type
    lines.push(`  ${me} -->|${escLabel(label)}| ${otherId}`)
  }

  lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
  lines.push(`  classDef peer fill:#f9fafb,stroke:#6b7280,color:#374151`)
  return lines.join("\n")
}
