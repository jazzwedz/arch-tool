import { NextResponse } from "next/server"
import { listDiagrams } from "@/lib/github"
import { isValidName } from "@/lib/validate"

export const dynamic = "force-dynamic"

// GET /api/components/[id]/diagrams
// Returns the names of diagrams whose XML references this component
// (matched on the `arch_id` attribute injected by drawio export).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }

    const all = await listDiagrams()
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const archIdRe = new RegExp(`arch_id\\s*=\\s*["']${escapedId}["']`)
    // Fallback: legacy plain `id="..."` matches on UserObject without arch_id.
    const labelRe = new RegExp(`(?:label|value)\\s*=\\s*["']${escapedId}["']`)

    const matches = all
      .filter((d) => archIdRe.test(d.content) || labelRe.test(d.content))
      .map((d) => ({ name: d.name }))

    return NextResponse.json(matches)
  } catch (error) {
    console.error(
      "Failed to list diagrams for component:",
      error instanceof Error ? error.message : "Unknown error"
    )
    return NextResponse.json(
      { error: "Failed to fetch diagrams" },
      { status: 500 }
    )
  }
}
