// GET / DELETE /api/solutions/[id]/dsd/artifacts/[artifactId]

import { NextResponse } from "next/server"
import { getDsd, deleteDsd } from "@/lib/dsd-store"
import { isValidName } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  return withRouteContext(request, async () => {
    const { id, artifactId } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid solution id" }, { status: 400 })
    }
    try {
      const artifact = await getDsd(id, artifactId)
      return NextResponse.json(artifact)
    } catch {
      return NextResponse.json({ error: "DSD not found" }, { status: 404 })
    }
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  return withRouteContext(request, async () => {
    const { id, artifactId } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid solution id" }, { status: 400 })
    }
    try {
      await deleteDsd(id, artifactId)
      return NextResponse.json({ success: true })
    } catch (error) {
      getLogger().error("Failed to delete DSD", {
        id,
        artifactId,
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json({ error: "Failed to delete DSD" }, { status: 500 })
    }
  })
}
