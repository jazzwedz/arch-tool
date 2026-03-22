import { NextResponse } from "next/server"
import { listComponents, saveComponent } from "@/lib/github"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const components = await listComponents()
    return NextResponse.json(components)
  } catch (error) {
    console.error("Failed to list components:", error)
    return NextResponse.json(
      { error: "Failed to fetch components" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const component = await request.json()
    await saveComponent(component)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save component:", error)
    return NextResponse.json(
      { error: "Failed to save component" },
      { status: 500 }
    )
  }
}
