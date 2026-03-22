import { NextResponse } from "next/server"
import { getDiagram, saveDiagram, deleteDiagram } from "@/lib/github"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const diagram = await getDiagram(name)
    return NextResponse.json(diagram)
  } catch (error) {
    console.error("Failed to get diagram:", error)
    return NextResponse.json(
      { error: "Diagram not found" },
      { status: 404 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const { content, sha } = await request.json()
    await saveDiagram(name, content, sha)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update diagram:", error)
    return NextResponse.json(
      { error: "Failed to update diagram" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const { sha } = await request.json()
    await deleteDiagram(name, sha)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete diagram:", error)
    return NextResponse.json(
      { error: "Failed to delete diagram" },
      { status: 500 }
    )
  }
}
