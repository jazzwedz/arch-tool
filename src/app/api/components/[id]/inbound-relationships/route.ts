import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"
import type { ComponentRelationship } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/components/[id]/inbound-relationships
//
// Returns every component whose `relationships[].target` equals this
// id. One row per matching relationship — a component that both
// depends-on AND fallback-for the same target shows up twice. Backlinks
// are derived live from the catalog (no cache), so a component deleted
// in a separate tab cannot continue to appear on a peer's detail page.

interface InboundRelationshipRef {
  id: string
  name: string
  type: string
  relationship: ComponentRelationship
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteContext(request, async () => {
    try {
      const { id } = await params
      if (!isValidName(id)) {
        return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
      }

      const all = await listComponents()
      const refs: InboundRelationshipRef[] = []
      for (const c of all) {
        if (c.id === id) continue
        for (const rel of c.relationships || []) {
          if (rel.target === id) {
            refs.push({
              id: c.id,
              name: c.name,
              type: c.type,
              relationship: rel,
            })
          }
        }
      }

      return NextResponse.json(refs)
    } catch (error) {
      getLogger().error("Failed to compute inbound relationships", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        { error: "Failed to fetch inbound relationships" },
        { status: 500 }
      )
    }
  })
}
