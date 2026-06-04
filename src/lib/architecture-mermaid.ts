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
import { RELATIONSHIP_LABELS, TYPE_COLORS, TYPE_LABELS } from "./constants"

export interface ArchitectureMermaidOptions {
  showRelationships: boolean
  showInterfaces: boolean
  showDataFlow: boolean
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

  // Relationships
  if (options.showRelationships) {
    for (const c of components) {
      for (const rel of c.relationships || []) {
        if (!rel.target) continue
        // Normalise inverse pairs to one canonical direction so two
        // declarations of the same architectural fact do not become
        // two arrows.
        let from = c.id
        let to = rel.target
        let type = rel.type
        if (type === "child-of") {
          ;[from, to] = [to, from]
          type = "parent-of"
        } else if (type === "communicates-with" && from > to) {
          // Symmetric — pick a stable canonical orientation by id.
          ;[from, to] = [to, from]
        }
        push({
          from,
          to,
          label: RELATIONSHIP_LABELS[type] || type,
          style: "relationship",
        })
      }
    }
  }

  // Interfaces — normalise to consumer → provider so the diagram reads
  // as "B uses A's API".
  if (options.showInterfaces) {
    for (const c of components) {
      for (const iface of c.interfaces || []) {
        if (!iface.target) continue
        let from: string
        let to: string
        if (iface.direction === "provides") {
          // c provides — caller is iface.target, provider is c
          from = iface.target
          to = c.id
        } else {
          // c consumes — caller is c, provider is iface.target
          from = c.id
          to = iface.target
        }
        const label = iface.name || iface.type
        push({ from, to, label, style: "interface" })
      }
    }
  }

  // Data flow — direction is always source → consumer regardless of
  // which side declared it.
  if (options.showDataFlow) {
    for (const c of components) {
      for (const inp of c.data?.inputs || []) {
        if (!inp.source || !inp.name) continue
        push({
          from: inp.source,
          to: c.id,
          label: inp.name,
          style: "data",
        })
      }
      for (const out of c.data?.outputs || []) {
        if (!out.name) continue
        for (const consumer of out.consumers || []) {
          if (!consumer) continue
          push({
            from: c.id,
            to: consumer,
            label: out.name,
            style: "data",
          })
        }
      }
    }
  }

  return Array.from(seen.values())
}
