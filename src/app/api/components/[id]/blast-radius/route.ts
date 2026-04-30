import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { computeBlastRadius } from "@/lib/blast-radius"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const all = await listComponents()
    if (!all.find((c) => c.id === id)) {
      return NextResponse.json({ error: "Component not found" }, { status: 404 })
    }
    const result = computeBlastRadius(id, all)
    return NextResponse.json(result)
  } catch (error) {
    console.error(
      "Failed to compute blast radius:",
      error instanceof Error ? error.message : "Unknown error"
    )
    return NextResponse.json(
      { error: "Failed to compute blast radius" },
      { status: 500 }
    )
  }
}
