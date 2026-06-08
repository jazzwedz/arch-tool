// GET  /api/solutions   — list all solutions
// POST /api/solutions   — create a solution (basic; the wizard's
//                         create-with-gap-components flow is layered on
//                         in a later phase).

import { NextResponse } from "next/server"
import { listSolutions, saveSolution } from "@/lib/solutions"
import { isValidName } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"
import type { Solution } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withRouteContext(request, async () => {
    try {
      const solutions = await listSolutions()
      return NextResponse.json(solutions)
    } catch (error) {
      getLogger().error("Failed to list solutions", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json({ error: "Failed to fetch solutions" }, { status: 500 })
    }
  })
}

export async function POST(request: Request) {
  return withRouteContext(request, async () => {
    try {
      const solution = (await request.json()) as Solution
      if (!solution.id || !isValidName(solution.id)) {
        return NextResponse.json({ error: "Invalid solution id" }, { status: 400 })
      }
      if (!solution.name) {
        return NextResponse.json({ error: "Missing required field: name" }, { status: 400 })
      }
      if (!solution.status) solution.status = "draft"
      if (!solution.description) solution.description = {}
      await saveSolution(solution)
      return NextResponse.json({ success: true, id: solution.id })
    } catch (error) {
      getLogger().error("Failed to save solution", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json({ error: "Failed to save solution" }, { status: 500 })
    }
  })
}
