// Catalog-wide architecture overview — every component on one mermaid
// flowchart.
//
// Three edge sources can be combined or independently toggled:
//
//   - relationships  →  declared parent-of / child-of / depends-on /
//                       communicates-with / reads-from / writes-to /
//                       fallback edges, drawn as solid arrows.
//   - interfaces     →  provides / consumes edges, drawn as dotted
//                       arrows. Direction is normalised consumer →
//                       provider so that A.provides:B and B.consumes:A
//                       collapse to a single arrow B → A.
//   - data flow      →  inputs[].source and outputs[].consumers, drawn
//                       as thick arrows. A:input.source=B and
//                       B:output.consumers includes A collapse to one
//                       arrow B → A labelled with the data item name.
//
// Each node is styled by its component type using TYPE_COLORS (same
// palette as the catalog cards and the drawio export). Optional
// `groupByType` wraps each type's nodes in a labelled subgraph so the
// chart reads as a clustered block diagram instead of a soup of nodes.
//
// Caller is responsible for the wrapping React component; this module
// is a pure string producer.

import type { Component } from "./types"
import { TYPE_COLORS, TYPE_LABELS } from "./constants"

export interface ArchitectureMermaidOptions {
  showRelationships: boolean
  showInterfaces: boolean
  /** @deprecated v2 Phase 2: data flow is now part of links[]; toggle is a no-op. */
  showDataFlow?: boolean
  groupByType: boolean
}

interface Edge {
  from: string
  to: string
  label: string
  style: "relationship" | "interface" | "data"
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_")
}

function escLabel(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/\n/g, " ").slice(0, 80)
}

function typeClass(type: string): string {
  // Mermaid classDef names cannot contain hyphens, so collapse the
  // catalog's kebab-case type into a flat identifier.
  return "t" + type.replace(/[^a-zA-Z0-9]/g, "")
}

export function buildArchitectureMermaid(
  components: Component[],
  options: ArchitectureMermaidOptions
): string {
  const lines: string[] = ["flowchart LR"]

  // Empty-state guard.
  if (components.length === 0) {
    lines.push(`  noop["No components in the catalog yet"]:::muted`)
    lines.push(`  classDef muted fill:#f3f4f6,stroke:#9ca3af,color:#6b7280`)
    return lines.join("\n")
  }

  // ----- nodes -----

  const byType = new Map<string, Component[]>()
  for (const c of components) {
    const arr = byType.get(c.type) || []
    arr.push(c)
    byType.set(c.type, arr)
  }

  if (options.groupByType) {
    // Render each populated type as a labelled subgraph so related
    // components cluster visually. Subgraphs preserve insertion order;
    // sort types alphabetically by label for a stable layout.
    const types = Array.from(byType.keys()).sort((a, b) =>
      (TYPE_LABELS[a as keyof typeof TYPE_LABELS] || a).localeCompare(
        TYPE_LABELS[b as keyof typeof TYPE_LABELS] || b
      )
    )
    for (const type of types) {
      const group = byType.get(type) || []
      const groupId = `grp_${typeClass(type)}`
      const label = TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type
      lines.push(`  subgraph ${groupId} ["${escLabel(label)}"]`)
      for (const c of group) {
        lines.push(
          `    ${safeId(c.id)}["${escLabel(c.name)}"]:::${typeClass(c.type)}`
        )
      }
      lines.push(`  end`)
    }
  } else {
    for (const c of components) {
      lines.push(
        `  ${safeId(c.id)}["${escLabel(c.name)}"]:::${typeClass(c.type)}`
      )
    }
  }

  // ----- edges -----

  const edges = collectEdges(components, options)
  for (const e of edges) {
    const arrow =
      e.style === "relationship"
        ? "-->"
        : e.style === "interface"
        ? "-.->"
        : "==>"
    lines.push(
      `  ${safeId(e.from)} ${arrow}|${escLabel(e.label)}| ${safeId(e.to)}`
    )
  }

  // ----- classDefs -----

  // One classDef per type that actually appears in the catalog. Limits
  // the chart preamble even on installs with all 20 types.
  const seenTypes = new Set<string>(byType.keys())
  for (const t of seenTypes) {
    const colors = TYPE_COLORS[t as keyof typeof TYPE_COLORS]
    if (!colors) continue
    lines.push(
      `  classDef ${typeClass(t)} fill:${colors.fill},stroke:${colors.border},color:${colors.text},stroke-width:1.5px`
    )
  }

  return lines.join("\n")
}

function collectEdges(
  components: Component[],
  options: ArchitectureMermaidOptions
): Edge[] {
  // Map keyed on canonical edge identity so A:parent-of:B + B:child-of:A
  // collapse to one entry. The first declaration wins; second is
  // dropped silently — the consistency check is the right place to
  // catch and surface duplicates.
  const seen = new Map<string, Edge>()
  const idSet = new Set(components.map((c) => c.id))

  const push = (e: Edge) => {
    // Drop edges into / out of components not in the catalog. The
    // detail page flags those as missing already; in the overview they
    // would draw arrows to nowhere.
    if (!idSet.has(e.from) || !idSet.has(e.to)) return
    if (e.from === e.to) return // self-edges add noise; skip
    const key = `${e.style}::${e.from}::${e.to}::${e.label}`
    if (!seen.has(key)) seen.set(key, e)
  }

  // v2: links[] replaces both relationships[] and interfaces[]. The
  // Relationships toggle covers `part-of` / `contains` / `reads-from`
  // / `writes-to` (structural and data-direction roles), the
  // Interfaces toggle covers `calls` / `serves` (active API edges).
  // Direction is normalised so mirror pairs collapse to one arrow.
  for (const c of components) {
    for (const link of c.links || []) {
      if (!link.target) continue

      const isInterfaceRole = link.role === "calls" || link.role === "serves"
      const isRelationshipRole = !isInterfaceRole
      if (isInterfaceRole && !options.showInterfaces) continue
      if (isRelationshipRole && !options.showRelationships) continue

      // Direction normalisation per role:
      //   calls    — already source → target
      //   serves   — flip so caller (target) → provider (source)
      //   contains — already source → target (parent → child)
      //   part-of  — flip so parent (target) → child (source) becomes parent → child
      //   reads-from / writes-to — keep source → target literal
      let from = c.id
      let to = link.target
      let canonicalLabel = link.role
      if (link.role === "serves") {
        ;[from, to] = [to, from]
        canonicalLabel = "calls"
      } else if (link.role === "part-of") {
        ;[from, to] = [to, from]
        canonicalLabel = "contains"
      }

      const label = link.name || link.protocol || canonicalLabel
      push({
        from,
        to,
        label,
        style: isInterfaceRole ? "interface" : "relationship",
      })
    }
  }

  // v2 Phase 2: data flow now lives inside `links[]` as reads-from /
  // writes-to roles. The Relationships toggle covers both — no
  // separate Data Flow toggle.

  return Array.from(seen.values())
}
