// POST /api/agents/coach/resolve
//
// Marks a coach proposal's source feedback as resolved (after the analyst
// approved or rejected it), so the coach never re-surfaces the same
// suggestions. Body: { feedbackIds: string[] }

import { NextResponse } from "next/server"
import { resolveFeedback } from "@/lib/dsd-coach"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return withRouteContext(request, async () => {
    let body: { feedbackIds?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 })
    }
    const ids = Array.isArray(body.feedbackIds)
      ? body.feedbackIds.filter((x): x is string => typeof x === "string")
      : []
    if (ids.length === 0) {
      return NextResponse.json({ success: true, resolved: 0 })
    }
    try {
      const resolved = await resolveFeedback(ids)
      return NextResponse.json({ success: true, resolved })
    } catch (error) {
      getLogger().error("Failed to resolve feedback", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json({ error: "Failed to resolve feedback" }, { status: 500 })
    }
  })
}
