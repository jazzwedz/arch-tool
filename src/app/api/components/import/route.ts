// POST /api/components/import
//
// Imports one or many components from YAML. Accepts either a single
// component document or a multi-doc bundle (`---` separated) — the same
// shape produced by the catalog YAML export.
//
// Conflict handling (when an incoming id already exists) is controlled
// by `onConflict`:
//   - "update" (default) — overwrite the existing component (upsert).
//   - "create"           — keep both: auto-append `-2`, `-3`, … to the
//                          incoming id (capped at -99).
//   - "skip"             — leave the existing component untouched.
//
// Returns a per-document report plus a summary. For a single applied
// document the final id is also surfaced at the top level so the client
// can redirect straight to its edit page.
//
// Note: bulk import does NOT gate on edit locks (it is an admin-style
// operation); the provider's sha-based concurrency check is the safety
// net for the "update" path.

import { NextResponse } from "next/server"
import { listComponents, getComponent, saveComponent } from "@/lib/github"
import { validateComponentDocs, type ValidationIssue } from "@/lib/component-schema"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"

const COLLISION_CAP = 99

type ConflictMode = "update" | "create" | "skip"
const CONFLICT_MODES: ConflictMode[] = ["update", "create", "skip"]

interface ImportBody {
  yaml?: string
  onConflict?: string
}

type ImportAction = "created" | "updated" | "renamed" | "skipped" | "error"

interface ImportResult {
  index: number
  id: string
  finalId?: string
  name?: string
  action: ImportAction
  warnings: ValidationIssue[]
  issues?: ValidationIssue[]
  error?: string
}

export async function POST(request: Request) {
  return withRouteContext(request, async () => {
    let body: ImportBody
    try {
      body = (await request.json()) as ImportBody
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 })
    }

    if (typeof body.yaml !== "string" || body.yaml.trim() === "") {
      return NextResponse.json(
        { error: "Missing field `yaml` — paste the component YAML in the request body." },
        { status: 400 }
      )
    }

    const onConflict: ConflictMode = CONFLICT_MODES.includes(body.onConflict as ConflictMode)
      ? (body.onConflict as ConflictMode)
      : "update"

    const validated = validateComponentDocs(body.yaml)

    // Snapshot existing ids once for collision detection.
    let ids: Set<string>
    try {
      const existing = await listComponents()
      ids = new Set(existing.map((c) => c.id))
    } catch (err) {
      getLogger().error("Failed to list components for import", {
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        { error: "Could not read existing components. Try again." },
        { status: 500 }
      )
    }

    const results: ImportResult[] = []

    for (let i = 0; i < validated.length; i++) {
      const v = validated[i]

      if (!v.ok) {
        results.push({
          index: i,
          id: "",
          action: "error",
          warnings: v.warnings,
          issues: v.errors,
          error: "Validation failed",
        })
        continue
      }

      const component = v.value
      const warnings = v.warnings

      try {
        if (!ids.has(component.id)) {
          // New component.
          await saveComponent(component)
          ids.add(component.id)
          results.push({
            index: i,
            id: component.id,
            finalId: component.id,
            name: component.name,
            action: "created",
            warnings,
          })
          continue
        }

        // id collides with an existing component.
        if (onConflict === "skip") {
          results.push({
            index: i,
            id: component.id,
            name: component.name,
            action: "skipped",
            warnings,
          })
          continue
        }

        if (onConflict === "update") {
          const existing = await getComponent(component.id)
          await saveComponent(component, existing.sha)
          results.push({
            index: i,
            id: component.id,
            finalId: component.id,
            name: component.name,
            action: "updated",
            warnings,
          })
          continue
        }

        // onConflict === "create": find a free `-N` id.
        let n = 2
        while (n <= COLLISION_CAP && ids.has(`${component.id}-${n}`)) n++
        if (n > COLLISION_CAP) {
          results.push({
            index: i,
            id: component.id,
            name: component.name,
            action: "error",
            warnings,
            error: `No free id after ${component.id}-${COLLISION_CAP}. Edit the id and retry.`,
          })
          continue
        }
        const finalId = `${component.id}-${n}`
        const originalId = component.id
        component.id = finalId
        await saveComponent(component)
        ids.add(finalId)
        results.push({
          index: i,
          id: originalId,
          finalId,
          name: component.name,
          action: "renamed",
          warnings,
        })
      } catch (err) {
        getLogger().error("Failed to import component", {
          id: component.id,
          err: err instanceof Error ? err.message : String(err),
        })
        results.push({
          index: i,
          id: component.id,
          name: component.name,
          action: "error",
          warnings,
          error: err instanceof Error ? err.message : "Save failed",
        })
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      renamed: results.filter((r) => r.action === "renamed").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      errors: results.filter((r) => r.action === "error").length,
    }

    getLogger().info("Component import", { onConflict, ...summary })

    const applied = summary.created + summary.updated + summary.renamed

    // Nothing applied and every document errored → 400 so the dialog
    // shows the validation/save problems (mirrors the old single-import
    // behaviour). Surface the first failing document's issues at the top
    // level for convenience.
    if (applied === 0 && summary.errors > 0) {
      const firstError = results.find((r) => r.action === "error")
      return NextResponse.json(
        {
          success: false,
          error: firstError?.error || "Import failed",
          issues: firstError?.issues,
          warnings: firstError?.warnings,
          results,
          summary,
        },
        { status: 400 }
      )
    }

    // Single applied document → surface its final id for redirect.
    const appliedResults = results.filter(
      (r) => r.action === "created" || r.action === "updated" || r.action === "renamed"
    )
    const singleId =
      appliedResults.length === 1 ? appliedResults[0].finalId : undefined

    return NextResponse.json({
      success: true,
      id: singleId,
      results,
      summary,
    })
  })
}
