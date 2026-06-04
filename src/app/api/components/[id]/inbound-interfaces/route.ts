import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"
import type { ComponentInterface } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/components/[id]/inbound-interfaces
//
// Returns every component whose `interfaces[].target` equals this id.
// One row per matching interface — a component that provides REST AND
// consumes async from the same target shows up twice, with different
// directions. The detail page renders these as backlinks so the
// analyst can see "who points at me" without having to scan the rest
// of the catalog manually.
//
// Computed live against the current catalog (no caching). The cost is
// one `listComponents()` call — same as the catalog landing page —
// and the work is a linear scan over the result.

interface InboundInterfaceRef {
  id: string
  name: string
  type: string
  iface: ComponentInterface
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
      const refs: InboundInterfaceRef[] = []
      for (const c of all) {
        if (c.id === id) continue
        for (const iface of c.interfaces || []) {
          if (iface.target === id) {
            refs.push({
              id: c.id,
              name: c.name,
              type: c.type,
              iface,
            })
          }
        }
      }

      return NextResponse.json(refs)
    } catch (error) {
      getLogger().error("Failed to compute inbound interfaces", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        { error: "Failed to fetch inbound interfaces" },
        { status: 500 }
      )
    }
  })
}
