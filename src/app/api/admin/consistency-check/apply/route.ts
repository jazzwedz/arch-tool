// POST /api/admin/consistency-check/apply
//
// Body: { issueId: string }
//
// Re-runs the scan against the live catalog and looks up the issue by
// its stable id. This makes the call idempotent: if the issue was
// already resolved (by a previous click, by a manual edit, or by
// another fix that incidentally repaired it), the lookup misses and
// the API returns 404 instead of double-applying. When the issue is
// still present the fix is applied to the target component and the
// updated YAML is committed through the existing git provider.

import { NextResponse } from "next/server"
import { getComponent, listComponents, saveComponent } from "@/lib/github"
import { applyFix, findInconsistencies } from "@/lib/consistency"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"

interface Body {
  issueId?: string
}

export async function POST(request: Request) {
  return withRouteContext(request, async () => {
    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 })
    }
    const issueId = body.issueId
    if (typeof issueId !== "string" || issueId === "") {
      return NextResponse.json(
        { error: "Missing field `issueId`." },
        { status: 400 }
      )
    }

    try {
      const components = await listComponents()
      const issues = findInconsistencies(components)
      const issue = issues.find((i) => i.id === issueId)
      if (!issue) {
        return NextResponse.json(
          {
            error:
              "Issue not found. It may already be resolved or the catalog has changed — refresh the check.",
          },
          { status: 404 }
        )
      }

      // Load the target with its current sha so saveComponent can do
      // optimistic concurrency through the git provider.
      const target = await getComponent(issue.applyTo)
      const { sha, ...current } = target
      const updated = applyFix(current, issue.fix)
      await saveComponent(updated, sha)

      getLogger().info("Consistency fix applied", {
        issueId,
        applyTo: issue.applyTo,
        category: issue.category,
        fixKind: issue.fix.kind,
      })

      return NextResponse.json({
        success: true,
        issueId,
        applyTo: issue.applyTo,
      })
    } catch (error) {
      getLogger().error("Failed to apply consistency fix", {
        issueId,
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        {
          error: `Failed to apply fix: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
        { status: 500 }
      )
    }
  })
}
