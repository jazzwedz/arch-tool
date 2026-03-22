import { NextResponse } from "next/server"
import { listComponents, saveComponent } from "@/lib/github"
import { isValidName } from "@/lib/validate"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const components = await listComponents()
    return NextResponse.json(components)
  } catch (error) {
    console.error("Failed to list components:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to fetch components" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const component = await request.json()
    if (!component.id || !isValidName(component.id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    if (!component.name || !component.type) {
      return NextResponse.json({ error: "Missing required fields: name, type" }, { status: 400 })
    }
    await saveComponent(component)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save component:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to save component" },
      { status: 500 }
    )
  }
}
