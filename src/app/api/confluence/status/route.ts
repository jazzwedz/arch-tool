import { NextResponse } from "next/server"
import { isConfluenceConfigured } from "@/lib/confluence"
import { getConfluenceLink } from "@/lib/github"
import { isValidName } from "@/lib/validate"

export const dynamic = "force-dynamic"

// GET /api/confluence/status?componentId=xxx
// Reports whether Confluence is configured and whether this component already has a published page.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const componentId = url.searchParams.get("componentId") || ""
    const configured = isConfluenceConfigured()
    if (!componentId) {
      return NextResponse.json({ configured })
    }
    if (!isValidName(componentId)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const link = await getConfluenceLink(componentId)
    return NextResponse.json({
      configured,
      published: !!link,
      pageId: link?.pageId,
      lastSyncedAt: link?.lastSyncedAt,
      pageUrl: link?.pageId
        ? `${process.env.CONFLUENCE_BASE_URL}/wiki/spaces/${process.env.CONFLUENCE_SPACE_KEY || "TR"}/pages/${link.pageId}`
        : undefined,
    })
  } catch (error) {
    console.error(
      "Failed to get confluence status:",
      error instanceof Error ? error.message : "Unknown error"
    )
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}
