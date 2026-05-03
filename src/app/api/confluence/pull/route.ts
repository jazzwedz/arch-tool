import { NextResponse } from "next/server"
import {
  getComponent,
  saveComponent,
  getConfluenceLink,
  saveConfluenceLink,
} from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { isConfluenceConfigured, getPage, findPageByComponentId } from "@/lib/confluence"
import {
  parseMetaTable,
  diffPatch,
  resolveDataClassification,
  resolveScaling,
} from "@/lib/confluence-parse"
import type { ComponentStatus, ComponentNFR } from "@/lib/types"
import { COMPONENT_STATUSES, DATA_CLASSIFICATION_LABELS } from "@/lib/constants"

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

    // Resolve page id: side-file first, fall back to title-based lookup.
    let pageId: string | undefined
    let linkSha: string | undefined
    try {
      const link = await getConfluenceLink(componentId)
      if (link) {
        pageId = link.pageId
        linkSha = link.sha
      }
    } catch (err) {
      console.warn(
        `getConfluenceLink failed for ${componentId}:`,
        err instanceof Error ? err.message : err
      )
    }
    if (!pageId) {
      const found = await findPageByComponentId(componentId)
      if (found) pageId = found.id
    }
    if (!pageId) {
      return NextResponse.json(
        { error: "Component has not been published to Confluence yet." },
        { status: 404 }
      )
    }

    const page = await getPage(pageId)
    const patch = parseMetaTable(page.body)
    const component = await getComponent(componentId)

    const currentDataClass = component.nfr?.data_classification
    const diff = diffPatch(
      {
        name: component.name,
        status: component.status,
        owner: component.owner || "",
        tags: component.tags || [],
        oneliner: component.description?.oneliner || "",
        availability: component.nfr?.availability || "",
        rto: component.nfr?.rto || "",
        rpo: component.nfr?.rpo || "",
        max_latency: component.nfr?.max_latency || "",
        throughput: component.nfr?.throughput || "",
        data_classification: currentDataClass
          ? DATA_CLASSIFICATION_LABELS[currentDataClass] || currentDataClass
          : "",
        scaling: component.nfr?.scaling || "",
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

    // Validate status — only commit if it's a known value, otherwise reject.
    if (
      patch.status !== undefined &&
      patch.status !== "" &&
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

    // Validate data_classification and scaling.
    let dataClassResolved: ReturnType<typeof resolveDataClassification> = undefined
    if (patch.data_classification !== undefined) {
      dataClassResolved = resolveDataClassification(patch.data_classification)
      if (dataClassResolved === null) {
        return NextResponse.json(
          {
            error: `Invalid Data Classification "${patch.data_classification}" in Confluence. Must be one of: ${Object.values(DATA_CLASSIFICATION_LABELS).join(", ")}.`,
            diff,
          },
          { status: 400 }
        )
      }
    }
    let scalingResolved: ReturnType<typeof resolveScaling> = undefined
    if (patch.scaling !== undefined) {
      scalingResolved = resolveScaling(patch.scaling)
      if (scalingResolved === null) {
        return NextResponse.json(
          {
            error: `Invalid Scaling Model "${patch.scaling}" in Confluence. Must be one of: horizontal, vertical, none.`,
            diff,
          },
          { status: 400 }
        )
      }
    }

    // Build merged NFR (preserve unchanged fields, apply patches).
    const mergedNfr: ComponentNFR = { ...(component.nfr || {}) }
    const applyNfrText = (key: keyof ComponentNFR, value: string | undefined) => {
      if (value === undefined) return
      if (value === "") delete mergedNfr[key]
      else (mergedNfr as Record<string, unknown>)[key] = value
    }
    applyNfrText("availability", patch.availability)
    applyNfrText("rto", patch.rto)
    applyNfrText("rpo", patch.rpo)
    applyNfrText("max_latency", patch.max_latency)
    applyNfrText("throughput", patch.throughput)
    if (patch.data_classification !== undefined) {
      if (dataClassResolved) mergedNfr.data_classification = dataClassResolved
      else delete mergedNfr.data_classification
    }
    if (patch.scaling !== undefined) {
      if (scalingResolved) mergedNfr.scaling = scalingResolved
      else delete mergedNfr.scaling
    }

    // Strip sha and nfr from the component before reassembling, so we control
    // exactly which fields end up in the YAML.
    const { sha: componentSha, nfr: _existingNfr, ...rest } = component
    void _existingNfr
    const hasNfr = Object.keys(mergedNfr).length > 0
    const updated = {
      ...rest,
      name: patch.name ?? component.name,
      status:
        patch.status !== undefined && patch.status !== ""
          ? (patch.status as ComponentStatus)
          : component.status,
      owner: patch.owner ?? component.owner,
      tags: patch.tags ?? component.tags,
      description: {
        ...component.description,
        oneliner: patch.oneliner ?? component.description?.oneliner ?? "",
      },
      ...(hasNfr ? { nfr: mergedNfr } : {}),
    }

    await saveComponent(updated, componentSha)

    // Best-effort side-file update; non-fatal if GitHub PAT cannot write.
    try {
      await saveConfluenceLink(
        {
          componentId,
          pageId,
          spaceId: page.spaceId,
          lastSyncedAt: new Date().toISOString(),
          lastPublishedVersion: page.version.number,
        },
        linkSha
      )
    } catch (err) {
      console.warn(
        `saveConfluenceLink failed for ${componentId} (pull still applied):`,
        err instanceof Error ? err.message : err
      )
    }

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
