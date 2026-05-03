import { NextResponse } from "next/server"
import { getComponent, getConfluenceLink, saveConfluenceLink } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import {
  isConfluenceConfigured,
  createPage,
  updatePage,
  getPage,
  findOrCreateCapabilityPage,
} from "@/lib/confluence"
import {
  buildPageBody,
  pageTitleFor,
  capabilityForHierarchy,
} from "@/lib/confluence-render"

export const dynamic = "force-dynamic"

interface PublishBody {
  componentId: string
  audienceLabel?: string
  narrativeMarkdown: string
}

export async function POST(request: Request) {
  try {
    if (!isConfluenceConfigured()) {
      return NextResponse.json(
        {
          error:
            "Confluence is not configured. Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_ID env vars.",
        },
        { status: 503 }
      )
    }

    const body = (await request.json()) as PublishBody
    const componentId = body.componentId
    if (!componentId || !isValidName(componentId)) {
      return NextResponse.json(
        { error: "Invalid or missing componentId" },
        { status: 400 }
      )
    }
    if (!body.narrativeMarkdown || body.narrativeMarkdown.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing narrativeMarkdown — generate the document first." },
        { status: 400 }
      )
    }

    const component = await getComponent(componentId)
    const audienceLabel = body.audienceLabel || "Technical"

    // Hierarchy mirror: ensure the parent capability page exists.
    const capabilityName = capabilityForHierarchy(component)
    const parent = await findOrCreateCapabilityPage(capabilityName)

    const storageBody = await buildPageBody({
      component,
      audienceLabel,
      narrativeMarkdown: body.narrativeMarkdown,
    })
    const title = pageTitleFor(component)

    // Already linked? Fetch latest version, update.
    const existing = await getConfluenceLink(componentId)
    let pageRef
    let action: "created" | "updated"

    if (existing) {
      try {
        const current = await getPage(existing.pageId)
        pageRef = await updatePage({
          pageId: existing.pageId,
          title,
          storageBody,
          currentVersion: current.version.number,
          parentId: parent.id,
          message: `synced from arch-tool: ${componentId}`,
        })
        action = "updated"
      } catch (err) {
        // Page might have been deleted in Confluence; fall through to create.
        console.warn(
          `Confluence page ${existing.pageId} no longer accessible, recreating:`,
          err instanceof Error ? err.message : err
        )
        pageRef = await createPage({
          title,
          storageBody,
          parentId: parent.id,
        })
        action = "created"
      }
    } else {
      pageRef = await createPage({
        title,
        storageBody,
        parentId: parent.id,
      })
      action = "created"
    }

    await saveConfluenceLink(
      {
        componentId,
        pageId: pageRef.id,
        spaceId: pageRef.spaceId,
        lastSyncedAt: new Date().toISOString(),
        lastPublishedVersion: pageRef.version.number,
      },
      existing?.sha
    )

    return NextResponse.json({
      action,
      pageId: pageRef.id,
      pageUrl: pageRef.fullUrl,
      capabilityParent: parent.title,
      capabilityParentId: parent.id,
    })
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : 500
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
        ? String((error as { message: string }).message)
        : "Unknown error"
    console.error("Failed to publish to Confluence:", message)
    return NextResponse.json(
      { error: `Failed to publish: ${message}` },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
