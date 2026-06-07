// Deterministic consistency checker for the catalog.
//
// Scans every component and yields a list of well-typed Issue objects
// — each describing exactly one missing backlink and exactly one
// atomic patch that would resolve it. Pure functions throughout: no
// I/O, no caching, no side effects. The API route loads components,
// runs `findInconsistencies`, hands the list back to the UI, and
// the apply endpoint reuses `applyFix` to mutate the target.
//
// Rules (v2 — links[]):
//
//   For every link whose target is a known component, the target
//   should declare the inverse role back (LINK_ROLE_INVERSE). All
//   three role pairs are audited:
//     - calls       ↔ serves      (API edge declared from both sides)
//     - part-of     ↔ contains    (containment declared from both sides)
//     - reads-from  ↔ writes-to   (data flow declared from both sides)
//   A mirror matches when target + role + `protocol` + `name` all
//   agree, so two APIs with different protocols, or two data items
//   with different `name`s, on the same target stay as separate edges
//   (each needing its own mirror). Links targeting an unknown id (a
//   free-form external label) are skipped.
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
// Every role has an inverse (LINK_ROLE_INVERSE), so all three pairs are
// audited: calls ↔ serves, part-of ↔ contains, and reads-from ↔
// writes-to. For data-flow edges the `name` field is part of the match
// key, so the suggested mirror carries the same data-item identity.

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
