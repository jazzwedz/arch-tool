// Build small mermaid diagrams scoped to a single component's perspective.
// Used by per-section "Visualize" buttons on the detail page.
//
// All builders accept an optional `nameLookup` map: component id →
// component name. When provided, target ids in relationships and
// interfaces are rendered as the human-readable component name; when
// omitted (or the id is absent from the map), the raw id is used as
// fallback. Detail pages pass the catalog snapshot they already have,
// so the analyst never sees `acme_order_db_prod` in a label when the
// component is actually called "Acme Order DB (prod)".

import type { Component } from "./types"
import {
  RELATIONSHIP_LABELS,
  CAPABILITY_ROLE_LABELS,
  DATA_KIND_LABELS,
} from "./constants"

export type NameLookup = Map<string, string>

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_")
}

function escLabel(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/\n/g, " ")
}

// Resolve a component id to a display label. Falls back to the raw id
// when no lookup is provided or the id is not in the map (e.g. broken
// reference or external label typed into a target field).
function displayTarget(id: string, lookup?: NameLookup): string {
  if (!id) return ""
  return lookup?.get(id) || id
}

/**
 * Visualise the component's interfaces.
 *
 * Layout: this component sits in the middle. `provides` interfaces extend
 * to "External callers" (or named target if present); `consumes` interfaces
 * point inward from "External providers" (or named target).
 */
export function buildInterfacesMermaid(
  component: Component,
  nameLookup?: NameLookup
): string {
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
    const otherLabel = iface.target
      ? displayTarget(iface.target, nameLookup)
      : iface.direction === "provides"
      ? "External caller"
      : "External source"
    lines.push(`  ${otherId}["${escLabel(otherLabel)}"]:::peer`)
    // Edge label: prefer the interface name when set, fall back to
    // the connector type. Description goes after the name for context.
    const head = iface.name || iface.type
    const tail = iface.description ? `: ${iface.description.slice(0, 40)}` : ""
    const protoLabel = `${head}${tail}`
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
 * Hero "Component context" diagram — combines interfaces, relationships,
 * inputs, outputs and owned data into a single flowchart so the user sees
 * the component in its environment at a glance. Used at the top of the
 * Overview tab on the detail page.
 *
 * The diagram is intentionally capped: at most 6 each of interfaces /
 * relationships and 8 inputs / outputs / owns. Beyond those counts the
 * picture stops telling a story.
 */
export function buildHeroContextMermaid(
  component: Component,
  nameLookup?: NameLookup
): string {
  const lines: string[] = ["flowchart LR"]
  const me = safeId(component.id)

  const interfaces = (component.interfaces || []).slice(0, 6)
  const inputs = (component.data?.inputs || []).slice(0, 8)
  const outputs = (component.data?.outputs || []).slice(0, 8)
  const owns = (component.data?.owns || []).slice(0, 6)
  const rels = (component.relationships || []).slice(0, 6)

  const total =
    interfaces.length + inputs.length + outputs.length + owns.length + rels.length
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

  // Interfaces — direction-aware. provides: external caller → me;
  // consumes: me → external target. Edge label prefers the interface
  // name and falls back to the connector type.
  let ifCounter = 0
  for (const iface of interfaces) {
    ifCounter++
    const otherId = iface.target
      ? `iface_t_${safeId(iface.target).slice(0, 18)}`
      : `iface_anon_${ifCounter}`
    const otherLabel = iface.target
      ? displayTarget(iface.target, nameLookup)
      : iface.direction === "provides"
      ? "External caller"
      : "External source"
    lines.push(`  ${otherId}["${escLabel(otherLabel)}"]:::peer`)
    const head = iface.name || iface.type
    const edgeLabel = head.slice(0, 32)
    if (iface.direction === "provides") {
      lines.push(`  ${otherId} -->|${escLabel(edgeLabel)}| ${me}`)
    } else {
      lines.push(`  ${me} -->|${escLabel(edgeLabel)}| ${otherId}`)
    }
  }

  // Relationships (peers, dotted gray). Target id resolved to name
  // when possible — was raw id in earlier versions.
  rels.forEach((rel, i) => {
    const nid = `rel_${i}_${safeId(rel.target).slice(0, 18)}`
    const otherLabel = displayTarget(rel.target, nameLookup)
    lines.push(`  ${nid}["${escLabel(otherLabel)}"]:::peer`)
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
export function buildRelationshipsMermaid(
  component: Component,
  nameLookup?: NameLookup
): string {
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
    const otherLabel = displayTarget(rel.target, nameLookup)
    lines.push(`  ${otherId}["${escLabel(otherLabel)}"]:::peer`)
    const label = RELATIONSHIP_LABELS[rel.type] || rel.type
    lines.push(`  ${me} -->|${escLabel(label)}| ${otherId}`)
  }

  lines.push(`  classDef self fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px`)
  lines.push(`  classDef peer fill:#f9fafb,stroke:#6b7280,color:#374151`)
  return lines.join("\n")
}
