// Deterministic consistency checker for the catalog.
//
// Scans every component and yields a list of well-typed Issue objects
// — each describing exactly one missing backlink and exactly one
// atomic patch that would resolve it. Pure functions throughout: no
// I/O, no caching, no side effects. The API route loads components,
// runs `findInconsistencies`, hands the list back to the UI, and
// the apply endpoint reuses `applyFix` to mutate the target.
//
// Rules:
//
//   Relationships
//     - parent-of ↔ child-of   (clear inverse pair)
//     - communicates-with      (self-symmetric)
//     Other types (depends-on, reads-from, writes-to, fallback) are
//     directional declarations with no required reverse — they stay
//     out of the check on purpose.
//
//   Interfaces
//     - provides ↔ consumes on the same `type` and `target`. When A
//       provides REST to B, B should consume REST from A; the mirror
//       inherits the original interface's name + description.
//
//   Data flow
//     - inputs[].source = B  →  B must declare an output (or owned
//       data item) with the same `name` AND include A in `consumers`.
//       Two derived issues: missing output, or output exists but A is
//       not in its consumers.
//     - outputs[].consumers includes B  →  B must declare an input
//       with the same `name` AND `source = A`. Two derived issues:
//       missing input, or input exists but `source` is empty (we do
//       NOT auto-fix when source points to a *different* component —
//       that is a true data-flow conflict the analyst should resolve).
//
// Each issue carries a stable id encoding the source declaration so
// the apply endpoint can re-find it from a fresh scan and refuse the
// click idempotently when the user double-fires or has already
// resolved it through another path.

import type {
  Component,
  ComponentLink,
  DataItem,
} from "./types"
import { LINK_ROLE_INVERSE, LINK_ROLE_LABELS } from "./constants"

export type ConsistencyFix =
  | { kind: "addLink"; link: ComponentLink }
  | { kind: "addOutput"; dataItem: DataItem }
  | { kind: "addInput"; dataItem: DataItem }
  | { kind: "addOutputConsumer"; outputName: string; consumerId: string }
  | { kind: "setInputSource"; inputName: string; sourceId: string }

export type IssueCategory = "links" | "data"

export interface ConsistencyIssue {
  /**
   * Stable id used as React key and as the lookup key in the apply
   * route. Encodes category + source declaration + target so a fresh
   * scan can resurface the same issue deterministically.
   */
  id: string
  category: IssueCategory
  /** Component the patch lands on. */
  applyTo: string
  applyToName: string
  /** Component that holds the original declaration (context only). */
  declaredOn: string
  declaredOnName: string
  /** Short headline shown as the row title. */
  title: string
  /** One-sentence explanation. */
  details: string
  /** Opaque patch payload for the apply endpoint. */
  fix: ConsistencyFix
}

// ----------------------------- detection -----------------------------

export function findInconsistencies(components: Component[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const byId = new Map<string, Component>(components.map((c) => [c.id, c]))

  for (const source of components) {
    checkLinks(source, byId, issues)
    checkDataInputs(source, byId, issues)
    checkDataOutputs(source, byId, issues)
  }

  // Sort: by category, then by applyTo name so rows in the same
  // target component cluster visually in the UI.
  const categoryOrder: Record<IssueCategory, number> = {
    links: 0,
    data: 1,
  }
  return issues.sort((a, b) => {
    const c = categoryOrder[a.category] - categoryOrder[b.category]
    if (c !== 0) return c
    const t = a.applyToName.localeCompare(b.applyToName)
    if (t !== 0) return t
    return a.title.localeCompare(b.title)
  })
}

// --- v2 links: mirror pair check ---
//
// Only the mirror-pair roles (calls ↔ serves, part-of ↔ contains) are
// audited. `reads-from` / `writes-to` are intentionally directional —
// the target of a data read is passive (database, queue, storage) and
// is not expected to declare the reciprocal direction.

function checkLinks(
  source: Component,
  byId: Map<string, Component>,
  out: ConsistencyIssue[]
): void {
  for (const link of source.links || []) {
    if (!link.target) continue
    const target = byId.get(link.target)
    if (!target) continue

    const inverseRole = LINK_ROLE_INVERSE[link.role]
    if (!inverseRole) continue

    // Match key allows multiple distinct edges on the same target with
    // different protocols (e.g. one calls rest + one calls async to
    // the same component is two real edges). Mirror lookup matches
    // target + role + protocol.
    const hasMirror = (target.links || []).some(
      (l) =>
        l.target === source.id &&
        l.role === inverseRole &&
        (l.protocol ?? "") === (link.protocol ?? "")
    )
    if (hasMirror) continue

    out.push({
      id: `link:${source.id}:${link.role}:${link.protocol ?? ""}:${target.id}`,
      category: "links",
      applyTo: target.id,
      applyToName: target.name,
      declaredOn: source.id,
      declaredOnName: source.name,
      title: `${target.name} is missing "${inverseRole}: ${source.id}"`,
      details: `${source.name} declares "${LINK_ROLE_LABELS[link.role]}: ${target.id}"${link.protocol ? ` over ${link.protocol}` : ""}, so ${target.name} should declare "${LINK_ROLE_LABELS[inverseRole]}: ${source.id}" in return.`,
      fix: {
        kind: "addLink",
        link: {
          target: source.id,
          role: inverseRole,
          ...(link.protocol ? { protocol: link.protocol } : {}),
          ...(link.name ? { name: link.name } : {}),
          ...(link.description ? { description: link.description } : {}),
        },
      },
    })
  }
}

// --- data: inputs side ---

function checkDataInputs(
  source: Component,
  byId: Map<string, Component>,
  out: ConsistencyIssue[]
): void {
  for (const inp of source.data?.inputs || []) {
    if (!inp.source || !inp.name) continue
    const supplier = byId.get(inp.source)
    if (!supplier) continue

    // Supplier should expose this datum as an output (preferred) or
    // as an owned item — we match on `outputs` first, since `owns`
    // is "source-of-truth" semantics that may or may not be consumed.
    const matchingOutput = (supplier.data?.outputs || []).find(
      (o) => o.name === inp.name
    )

    if (!matchingOutput) {
      out.push({
        id: `data:in2out:${source.id}:${inp.name}:${supplier.id}`,
        category: "data",
        applyTo: supplier.id,
        applyToName: supplier.name,
        declaredOn: source.id,
        declaredOnName: source.name,
        title: `${supplier.name} is missing output "${inp.name}"`,
        details: `${source.name} reads "${inp.name}" from ${supplier.name} as input, but ${supplier.name} does not declare a matching output.`,
        fix: {
          kind: "addOutput",
          dataItem: {
            name: inp.name,
            kind: inp.kind,
            consumers: [source.id],
            ...(inp.purpose ? { purpose: inp.purpose } : {}),
            ...(inp.description ? { description: inp.description } : {}),
          },
        },
      })
      continue
    }

    if (!(matchingOutput.consumers || []).includes(source.id)) {
      out.push({
        id: `data:in2outConsumer:${source.id}:${inp.name}:${supplier.id}`,
        category: "data",
        applyTo: supplier.id,
        applyToName: supplier.name,
        declaredOn: source.id,
        declaredOnName: source.name,
        title: `${supplier.name}'s output "${inp.name}" is missing consumer ${source.id}`,
        details: `${source.name} reads "${inp.name}" from ${supplier.name}, but ${supplier.name}'s "${inp.name}" output does not list ${source.name} among its consumers.`,
        fix: {
          kind: "addOutputConsumer",
          outputName: inp.name,
          consumerId: source.id,
        },
      })
    }
  }
}

// --- data: outputs side ---

function checkDataOutputs(
  source: Component,
  byId: Map<string, Component>,
  out: ConsistencyIssue[]
): void {
  for (const outItem of source.data?.outputs || []) {
    if (!outItem.name) continue
    for (const consumerId of outItem.consumers || []) {
      if (!consumerId) continue
      const consumer = byId.get(consumerId)
      if (!consumer) continue

      const matchingInput = (consumer.data?.inputs || []).find(
        (i) => i.name === outItem.name
      )

      if (!matchingInput) {
        out.push({
          id: `data:out2in:${source.id}:${outItem.name}:${consumer.id}`,
          category: "data",
          applyTo: consumer.id,
          applyToName: consumer.name,
          declaredOn: source.id,
          declaredOnName: source.name,
          title: `${consumer.name} is missing input "${outItem.name}"`,
          details: `${source.name} emits "${outItem.name}" to ${consumer.name} (listed in its output's consumers), but ${consumer.name} does not declare a matching input.`,
          fix: {
            kind: "addInput",
            dataItem: {
              name: outItem.name,
              kind: outItem.kind,
              source: source.id,
              ...(outItem.purpose ? { purpose: outItem.purpose } : {}),
              ...(outItem.description ? { description: outItem.description } : {}),
            },
          },
        })
        continue
      }

      // Input exists. Only auto-fix when source is unset — when the
      // input points to a different component, that's a real data-flow
      // conflict and the analyst should resolve it manually.
      if (!matchingInput.source) {
        out.push({
          id: `data:out2inSource:${source.id}:${outItem.name}:${consumer.id}`,
          category: "data",
          applyTo: consumer.id,
          applyToName: consumer.name,
          declaredOn: source.id,
          declaredOnName: source.name,
          title: `${consumer.name}'s input "${outItem.name}" is missing a source`,
          details: `${source.name} emits "${outItem.name}" to ${consumer.name}, but ${consumer.name}'s "${outItem.name}" input has no source set. Should be set to ${source.id}.`,
          fix: {
            kind: "setInputSource",
            inputName: outItem.name,
            sourceId: source.id,
          },
        })
      }
    }
  }
}

// ----------------------------- apply -----------------------------

/**
 * Apply a single fix to a component, returning a new Component object.
 * Pure function — no I/O. The caller is responsible for persisting the
 * result. Defensive: if the patch target row no longer exists (e.g.
 * the user already removed the output during their last edit), the
 * fix degrades to a sensible default (typically a no-op) instead of
 * throwing.
 */
export function applyFix(component: Component, fix: ConsistencyFix): Component {
  // Cheap deep clone via structured serialisation; the catalog YAML is
  // small enough that this is faster than hand-rolling deep copies and
  // immune to future schema additions.
  const next = JSON.parse(JSON.stringify(component)) as Component

  switch (fix.kind) {
    case "addLink": {
      next.links = [...(next.links || []), fix.link]
      return next
    }
    case "addOutput": {
      next.data = next.data || {}
      next.data.outputs = [...(next.data.outputs || []), fix.dataItem]
      return next
    }
    case "addInput": {
      next.data = next.data || {}
      next.data.inputs = [...(next.data.inputs || []), fix.dataItem]
      return next
    }
    case "addOutputConsumer": {
      if (!next.data?.outputs) return next
      next.data.outputs = next.data.outputs.map((o) => {
        if (o.name !== fix.outputName) return o
        const consumers = [...(o.consumers || [])]
        if (!consumers.includes(fix.consumerId)) consumers.push(fix.consumerId)
        return { ...o, consumers }
      })
      return next
    }
    case "setInputSource": {
      if (!next.data?.inputs) return next
      next.data.inputs = next.data.inputs.map((i) =>
        i.name === fix.inputName ? { ...i, source: fix.sourceId } : i
      )
      return next
    }
  }
}
