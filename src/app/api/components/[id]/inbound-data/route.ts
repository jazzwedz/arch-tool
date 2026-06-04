import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"
import type { DataItem } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/components/[id]/inbound-data
//
// Returns the data references *other* components have on this one.
// Two kinds of refs, both surfaced in the response so the detail page
// can group them visually:
//
//   - `via: "input-source"` — the other component declares this
//     component as the source of one of its inputs. From this
//     component's perspective, that means a downstream consumer of
//     its data: the linked DataItem is what they receive. Logically
//     this DataItem should exist as an output (or owned datum) on
//     this side — the form encourages that, but does not enforce it
//     yet.
//
//   - `via: "output-consumer"` — the other component declares this
//     component as a consumer of one of its outputs. From this
//     component's perspective, that means an upstream provider of
//     its data: the linked DataItem is what they push to us.
//
// Computed live, no cache — same pattern as the interface and
// relationship backlink sub-routes.

interface InboundDataRef {
  id: string
  name: string
  type: string
  via: "input-source" | "output-consumer"
  dataItem: DataItem
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
      const refs: InboundDataRef[] = []
      for (const c of all) {
        if (c.id === id) continue
        // input-source: their inputs[i].source === me
        for (const item of c.data?.inputs || []) {
          if (item.source === id) {
            refs.push({
              id: c.id,
              name: c.name,
              type: c.type,
              via: "input-source",
              dataItem: item,
            })
          }
        }
        // output-consumer: their outputs[i].consumers contains me
        for (const item of c.data?.outputs || []) {
          if (item.consumers && item.consumers.includes(id)) {
            refs.push({
              id: c.id,
              name: c.name,
              type: c.type,
              via: "output-consumer",
              dataItem: item,
            })
          }
        }
      }

      return NextResponse.json(refs)
    } catch (error) {
      getLogger().error("Failed to compute inbound data refs", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        { error: "Failed to fetch inbound data refs" },
        { status: 500 }
      )
    }
  })
}
