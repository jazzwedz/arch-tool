import { NextResponse } from "next/server"
import { listDiagrams, saveDiagram } from "@/lib/github"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const diagrams = await listDiagrams()
    return NextResponse.json(diagrams)
  } catch (error) {
    console.error("Failed to list diagrams:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to fetch diagrams" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { name, content } = await request.json()
    if (!name || /[^a-zA-Z0-9_\-. ]/.test(name)) {
      return NextResponse.json(
        { error: "Invalid diagram name" },
        { status: 400 }
      )
    }
    await saveDiagram(name, content)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save diagram:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to save diagram" },
      { status: 500 }
    )
  }
}
