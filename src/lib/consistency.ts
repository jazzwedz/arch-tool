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

import type { Component, ComponentLink } from "./types"
import { LINK_ROLE_INVERSE, LINK_ROLE_LABELS } from "./constants"

export type ConsistencyFix = { kind: "addLink"; link: ComponentLink }

export type IssueCategory = "links"

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
  }

  // Sort: by category, then by applyTo name so rows in the same
  // target component cluster visually in the UI.
  const categoryOrder: Record<IssueCategory, number> = {
    links: 0,
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
    // different protocols or data names. For interface edges (calls /
    // serves) the protocol disambiguates two distinct APIs; for data
    // edges (reads-from / writes-to) the `name` field carries the
    // DataItem identity so two writes-to with different names stay as
    // two real edges.
    const hasMirror = (target.links || []).some(
      (l) =>
        l.target === source.id &&
        l.role === inverseRole &&
        (l.protocol ?? "") === (link.protocol ?? "") &&
        (l.name ?? "") === (link.name ?? "")
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

// v2 Phase 2: data input/output checks are gone. Data flow lives in
// links[] now with role reads-from / writes-to, and the mirror pair
// in checkLinks handles the same audit (target + role + name match).

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
  }
}
