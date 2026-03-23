import { NextResponse } from "next/server"
import { getComponentHistory } from "@/lib/github"
import { isValidName } from "@/lib/validate"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const history = await getComponentHistory(id)
    return NextResponse.json(history)
  } catch (error) {
    console.error("Failed to get component history:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    )
  }
}
