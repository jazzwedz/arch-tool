import { NextResponse } from "next/server"
import { getComponent, saveComponent } from "@/lib/github"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const component = await getComponent(id)
    return NextResponse.json(component)
  } catch (error) {
    console.error("Failed to get component:", error)
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { sha, ...component } = await request.json()
    if (component.id !== id) {
      return NextResponse.json(
        { error: "Component ID mismatch" },
        { status: 400 }
      )
    }
    await saveComponent(component, sha)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update component:", error)
    return NextResponse.json(
      { error: "Failed to update component" },
      { status: 500 }
    )
  }
}
