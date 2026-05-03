import { NextResponse } from "next/server"
import {
  getComponent,
  saveComponent,
  getConfluenceLink,
  saveConfluenceLink,
} from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { isConfluenceConfigured, getPage } from "@/lib/confluence"
import { parseMetaTable, diffPatch } from "@/lib/confluence-parse"
import type { ComponentStatus } from "@/lib/types"
import { COMPONENT_STATUSES } from "@/lib/constants"

export const dynamic = "force-dynamic"

interface PullBody {
  componentId: string
  apply?: boolean // if false, return diff only (preview); if true, apply changes
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

    const body = (await request.json()) as PullBody
    const componentId = body.componentId
    const apply = !!body.apply
    if (!componentId || !isValidName(componentId)) {
      return NextResponse.json(
        { error: "Invalid or missing componentId" },
        { status: 400 }
      )
    }

    const link = await getConfluenceLink(componentId)
    if (!link) {
      return NextResponse.json(
        { error: "Component has not been published to Confluence yet." },
        { status: 404 }
      )
    }

    const page = await getPage(link.pageId)
    const patch = parseMetaTable(page.body)
    const component = await getComponent(componentId)

    const diff = diffPatch(
      {
        name: component.name,
        status: component.status,
        owner: component.owner || "",
        tags: component.tags || [],
        oneliner: component.description?.oneliner || "",
      },
      patch
    )

    if (!apply || diff.length === 0) {
      return NextResponse.json({
        applied: false,
        diff,
        confluenceVersion: page.version.number,
        confluenceUrl: page.fullUrl,
      })
    }

    // Validate status — only commit if it's a known value, otherwise skip that field.
    if (
      patch.status !== undefined &&
      !COMPONENT_STATUSES.includes(patch.status as ComponentStatus)
    ) {
      return NextResponse.json(
        {
          error: `Invalid status "${patch.status}" in Confluence. Must be one of: ${COMPONENT_STATUSES.join(", ")}.`,
          diff,
        },
        { status: 400 }
      )
    }

    // Strip sha from the component before saving — saveComponent serializes
    // the whole object to YAML and we don't want sha to leak into the file.
    const { sha: componentSha, ...componentWithoutSha } = component
    const updated = {
      ...componentWithoutSha,
      name: patch.name ?? component.name,
      status: (patch.status as ComponentStatus | undefined) ?? component.status,
      owner: patch.owner ?? component.owner,
      tags: patch.tags ?? component.tags,
      description: {
        ...component.description,
        oneliner: patch.oneliner ?? component.description?.oneliner ?? "",
      },
    }

    await saveComponent(updated, componentSha)

    await saveConfluenceLink(
      {
        ...link,
        lastSyncedAt: new Date().toISOString(),
        lastPublishedVersion: page.version.number,
      },
      link.sha
    )

    return NextResponse.json({
      applied: true,
      diff,
      confluenceVersion: page.version.number,
      confluenceUrl: page.fullUrl,
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
    console.error("Failed to pull from Confluence:", message)
    return NextResponse.json(
      { error: `Failed to pull: ${message}` },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
