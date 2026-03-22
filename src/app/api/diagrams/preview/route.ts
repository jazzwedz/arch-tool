import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { xml } = await request.json()

    if (!xml) {
      return NextResponse.json({ error: "No XML provided" }, { status: 400 })
    }

    const res = await fetch("https://convert.diagrams.net/node/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xml,
        format: "png",
        scale: 2,
        border: 20,
      }),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: "Diagram export failed" },
        { status: 502 }
      )
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (error) {
    console.error("Diagram preview failed:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    )
  }
}
