import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { generateMxLibrary } from "@/lib/drawio"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const components = await listComponents()
    const xml = generateMxLibrary(components)

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": 'attachment; filename="arch-components.xml"',
      },
    })
  } catch (error) {
    console.error("Draw.io export error:", error)
    return NextResponse.json(
      { error: "Failed to generate Draw.io library" },
      { status: 500 }
    )
  }
}
