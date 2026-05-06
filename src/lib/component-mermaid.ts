// Build small mermaid diagrams scoped to a single component's perspective.
// Used by per-section "Visualize" buttons on the detail page.

import type { Component } from "./types"
import {
  RELATIONSHIP_LABELS,
  CAPABILITY_ROLE_LABELS,
  DATA_KIND_LABELS,
} from "./constants"

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
 * Visualise the component's capabilities — which business capabilities it
 * supports and the role it plays in each. The component sits on the left;
 * capability nodes fan out to the right, edges labelled with the role.
 */
export function buildCapabilitiesMermaid(component: Component): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)
  lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)

  const caps = component.capabilities || []
  if (caps.length === 0) {
    lines.push(`  noop["No capabilities defined"]:::muted`)
    lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  caps.forEach((cap, i) => {
    const capId = `cap_${i}_${safeId(cap.name).slice(0, 24) || "x"}`
    const cls =
      cap.role === "owner"
        ? ":::owner"
        : cap.role === "contributor"
        ? ":::contributor"
        : cap.role === "consumer"
        ? ":::consumer"
        : ":::indirect"
    lines.push(`  ${capId}["${escLabel(cap.name)}"]${cls}`)
    const roleLabel = CAPABILITY_ROLE_LABELS[cap.role] || cap.role
    lines.push(`  ${me} -->|${escLabel(roleLabel)}| ${capId}`)
  })

  lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
  lines.push(`  classDef owner fill:#dbeafe,stroke:#2563eb,color:#1e3a8a`)
  lines.push(`  classDef contributor fill:#dcfce7,stroke:#16a34a,color:#14532d`)
  lines.push(`  classDef consumer fill:#f3f4f6,stroke:#6b7280,color:#374151`)
  lines.push(`  classDef indirect fill:#fef3c7,stroke:#d97706,color:#78350f`)
  return lines.join("\n")
}

/**
 * Visualise the component's inputs / outputs / owned data as a flow.
 * Inputs sit on the left, the component in the centre, outputs on the right;
 * owned data attaches underneath with a dotted edge (state, not flow).
 */
export function buildIOMermaid(component: Component): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)
  lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)

  const inputs = component.data?.inputs || []
  const outputs = component.data?.outputs || []
  const owns = component.data?.owns || []

  if (inputs.length === 0 && outputs.length === 0 && owns.length === 0) {
    lines.push(`  noop["No inputs, outputs, or owned data defined"]:::muted`)
    lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  inputs.forEach((item, i) => {
    const nid = `in_${i}_${safeId(item.name).slice(0, 24) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    lines.push(`  ${nid}["${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>"]:::input`)
    const edgeLabel = item.purpose ? item.purpose.slice(0, 32) : kindLabel
    lines.push(`  ${nid} -->|${escLabel(edgeLabel)}| ${me}`)
  })

  outputs.forEach((item, i) => {
    const nid = `out_${i}_${safeId(item.name).slice(0, 24) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    lines.push(`  ${nid}["${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>"]:::output`)
    const edgeLabel = item.purpose ? item.purpose.slice(0, 32) : kindLabel
    lines.push(`  ${me} -->|${escLabel(edgeLabel)}| ${nid}`)
  })

  owns.forEach((item, i) => {
    const nid = `own_${i}_${safeId(item.name).slice(0, 24) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    // Cylinder-shape node hints "stored data" in mermaid syntax: id[(label)]
    lines.push(`  ${nid}[("${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>")]:::owned`)
    lines.push(`  ${me} -.owns.- ${nid}`)
  })

  lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
  lines.push(`  classDef input fill:#dcfce7,stroke:#16a34a,color:#14532d`)
  lines.push(`  classDef output fill:#fce7f3,stroke:#be185d,color:#831843`)
  lines.push(`  classDef owned fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95`)
  return lines.join("\n")
}

/**
 * Hero "Component context" diagram — combines relationships, inputs,
 * outputs and owned data into a single flowchart so the user sees the
 * component in its environment at a glance. Used at the top of the
 * Overview tab on the detail page.
 */
export function buildHeroContextMermaid(component: Component): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)

  const inputs = (component.data?.inputs || []).slice(0, 8)
  const outputs = (component.data?.outputs || []).slice(0, 8)
  const owns = (component.data?.owns || []).slice(0, 6)
  const rels = (component.relationships || []).slice(0, 8)

  const total = inputs.length + outputs.length + owns.length + rels.length
  if (total === 0) {
    lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)
    lines.push(
      `  noop["No connections, inputs/outputs or owned data yet — start by adding them in Edit"]:::muted`
    )
    lines.push(
      `  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`
    )
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  // Inputs (left).
  inputs.forEach((item, i) => {
    const nid = `in_${i}_${safeId(item.name).slice(0, 18) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    lines.push(
      `  ${nid}["${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>"]:::input`
    )
    const edge = item.purpose ? item.purpose.slice(0, 24) : kindLabel
    lines.push(`  ${nid} -->|${escLabel(edge)}| ${me}`)
  })

  // Self.
  lines.push(`  ${me}["${escLabel(component.name)}"]:::self`)

  // Outputs (right).
  outputs.forEach((item, i) => {
    const nid = `out_${i}_${safeId(item.name).slice(0, 18) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    lines.push(
      `  ${nid}["${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>"]:::output`
    )
    const edge = item.purpose ? item.purpose.slice(0, 24) : kindLabel
    lines.push(`  ${me} -->|${escLabel(edge)}| ${nid}`)
  })

  // Relationships (peers, gray).
  rels.forEach((rel, i) => {
    const nid = `rel_${i}_${safeId(rel.target).slice(0, 18)}`
    lines.push(`  ${nid}["${escLabel(rel.target)}"]:::peer`)
    const label = RELATIONSHIP_LABELS[rel.type] || rel.type
    lines.push(`  ${me} -.${escLabel(label)}.- ${nid}`)
  })

  // Owned data (cylinders, dotted).
  owns.forEach((item, i) => {
    const nid = `own_${i}_${safeId(item.name).slice(0, 18) || "x"}`
    const kindLabel = DATA_KIND_LABELS[item.kind] || item.kind
    lines.push(
      `  ${nid}[("${escLabel(item.name)}<br/><i>${escLabel(kindLabel)}</i>")]:::owned`
    )
    lines.push(`  ${me} -.owns.- ${nid}`)
  })

  lines.push(
    `  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:3px`
  )
  lines.push(`  classDef input fill:#dcfce7,stroke:#16a34a,color:#14532d`)
  lines.push(`  classDef output fill:#fce7f3,stroke:#be185d,color:#831843`)
  lines.push(`  classDef peer fill:#f9fafb,stroke:#6b7280,color:#374151`)
  lines.push(`  classDef owned fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95`)
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
