// POST /api/components/import
//
// Validates a single component YAML, resolves any id collision by
// auto-appending `-2`, `-3`, … (capped at -99 so a stuck loop can't
// silently hammer the git provider), then saves via the existing
// component store. Returns the final id so the client can redirect
// straight to the edit page.

import { NextResponse } from "next/server"
import { listComponents, saveComponent } from "@/lib/github"
import { validateComponentYaml } from "@/lib/component-schema"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"

const COLLISION_CAP = 99

interface ImportBody {
  yaml?: string
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

    const result = validateComponentYaml(body.yaml)
    if (!result.ok) {
      getLogger().warn("Component import rejected", {
        errors: result.errors.length,
        warnings: result.warnings.length,
      })
      return NextResponse.json(
        { error: "Validation failed", issues: result.errors, warnings: result.warnings },
        { status: 400 }
      )
    }

    const component = result.value
    const warnings = result.warnings

    // Collision-resolve the id against the current catalog.
    let finalId = component.id
    let renamed = false
    try {
      const existing = await listComponents()
      const ids = new Set(existing.map((c) => c.id))
      if (ids.has(finalId)) {
        let n = 2
        while (n <= COLLISION_CAP && ids.has(`${component.id}-${n}`)) n++
        if (n > COLLISION_CAP) {
          return NextResponse.json(
            {
              error: `Cannot find a free id after trying up to ${component.id}-${COLLISION_CAP}. Edit the YAML to set a different id.`,
            },
            { status: 409 }
          )
        }
        finalId = `${component.id}-${n}`
        renamed = true
      }
    } catch (err) {
      getLogger().error("Failed to list components for collision check", {
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        { error: "Could not check existing components. Try again." },
        { status: 500 }
      )
    }

    component.id = finalId

    try {
      await saveComponent(component)
    } catch (err) {
      getLogger().error("Failed to save imported component", {
        id: finalId,
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        {
          error: `Failed to save component: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
        { status: 500 }
      )
    }

    getLogger().info("Component imported", {
      id: finalId,
      type: component.type,
      renamed,
      warnings: warnings.length,
    })

    return NextResponse.json({
      success: true,
      id: finalId,
      renamed,
      warnings,
    })
  })
}
