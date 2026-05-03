import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import yaml from "js-yaml"
import {
  getComponent,
  saveComponent,
  getConfluenceLink,
  saveConfluenceLink,
} from "@/lib/github"
import { isValidName } from "@/lib/validate"
import {
  isConfluenceConfigured,
  getPage,
  findPageByComponentId,
} from "@/lib/confluence"
import {
  parseMetaTable,
  diffPatch,
  resolveDataClassification,
  resolveScaling,
} from "@/lib/confluence-parse"
import type {
  ComponentNFR,
  ComponentStatus,
  DataClassification,
  ScalingModel,
} from "@/lib/types"
import { COMPONENT_STATUSES, DATA_CLASSIFICATION_LABELS } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const anthropic = new Anthropic()

type Confidence = "high" | "medium" | "low"
type PatchSource = "table" | "ai"

export interface SmartPatch {
  field: string // e.g. "name", "owner", "tags", "description.oneliner", "nfr.availability"
  oldValue: string
  newValue: string
  source: PatchSource
  confidence: Confidence
  evidence?: string // for AI: a short quote from the page
}

interface PullSmartBody {
  componentId: string
  apply?: boolean
  patches?: SmartPatch[]
}

// Field paths recognised by both proposal and apply phases.
const ALLOWED_FIELDS = new Set<string>([
  "name",
  "status",
  "owner",
  "tags",
  "description.oneliner",
  "description.technical",
  "description.business",
  "nfr.availability",
  "nfr.rto",
  "nfr.rpo",
  "nfr.max_latency",
  "nfr.throughput",
  "nfr.data_classification",
  "nfr.scaling",
])

export async function POST(request: Request) {
  try {
    if (!isConfluenceConfigured()) {
      return NextResponse.json(
        { error: "Confluence is not configured." },
        { status: 503 }
      )
    }

    const body = (await request.json()) as PullSmartBody
    const componentId = body.componentId
    if (!componentId || !isValidName(componentId)) {
      return NextResponse.json(
        { error: "Invalid or missing componentId" },
        { status: 400 }
      )
    }

    // Resolve page id (side-file → title fallback).
    let pageId: string | undefined
    let linkSha: string | undefined
    try {
      const link = await getConfluenceLink(componentId)
      if (link) {
        pageId = link.pageId
        linkSha = link.sha
      }
    } catch {
      // ignore
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
    const component = await getComponent(componentId)

    if (body.apply) {
      const patches = body.patches || []
      return await applyPatches({
        componentId,
        component,
        patches,
        pageId,
        linkSha,
        pageVersion: page.version.number,
        pageSpaceId: page.spaceId,
      })
    }

    // PROPOSE phase: gather deterministic table patches + AI narrative patches.
    const clientIp = request.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute." },
        { status: 429 }
      )
    }

    const tablePatches = computeTablePatches(page.body, component)
    const aiPatches = await computeAiPatches(page.body, component)

    // Merge: keep all, but if a field appears in BOTH with same newValue,
    // collapse to the high-confidence (table) version. If newValues differ,
    // keep both so the user can pick.
    const merged = mergePatches(tablePatches, aiPatches)

    return NextResponse.json({
      patches: merged,
      confluenceVersion: page.version.number,
      confluenceUrl: page.fullUrl,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
        ? String((error as { message: string }).message)
        : "Unknown error"
    console.error("Failed pull-smart:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function computeTablePatches(
  storageBody: string,
  component: { name: string; status: string; owner?: string; tags?: string[]; description?: { oneliner?: string }; nfr?: ComponentNFR }
): SmartPatch[] {
  const patch = parseMetaTable(storageBody)
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
  return diff.map((d) => ({
    field: tableFieldToPath(d.field),
    oldValue: d.oldValue,
    newValue: d.newValue,
    source: "table" as const,
    confidence: "high" as const,
  }))
}

function tableFieldToPath(f: string): string {
  // diffPatch already uses dot-notation for NFR (nfr.availability etc).
  if (f === "oneliner") return "description.oneliner"
  return f
}

async function computeAiPatches(
  storageBody: string,
  component: unknown
): Promise<SmartPatch[]> {
  const pageText = storageToText(storageBody)
  const yamlText = yaml.dump(component, { lineWidth: -1, sortKeys: false })
  const prompt = buildPrompt(yamlText, pageText)

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    })
    const textBlock = message.content.find((b) => b.type === "text")
    const raw = textBlock ? textBlock.text : ""
    const parsed = extractJson(raw)
    if (!parsed || !Array.isArray(parsed.patches)) return []
    const out: SmartPatch[] = []
    for (const raw of parsed.patches) {
      const p = raw as {
        field?: unknown
        oldValue?: unknown
        newValue?: unknown
        confidence?: unknown
        evidence?: unknown
      }
      if (
        typeof p?.field === "string" &&
        ALLOWED_FIELDS.has(p.field) &&
        typeof p.newValue !== "undefined"
      ) {
        const conf = p.confidence
        const confidence: Confidence =
          conf === "high" || conf === "medium" || conf === "low" ? conf : "medium"
        out.push({
          field: p.field,
          oldValue:
            typeof p.oldValue === "string" ? p.oldValue : String(p.oldValue ?? ""),
          newValue:
            typeof p.newValue === "string" ? p.newValue : String(p.newValue ?? ""),
          source: "ai",
          confidence,
          evidence:
            typeof p.evidence === "string" ? p.evidence.slice(0, 240) : undefined,
        })
      }
    }
    return out
  } catch (err) {
    console.warn("AI scan failed:", err instanceof Error ? err.message : err)
    return []
  }
}

function storageToText(storage: string): string {
  // Convert Confluence storage XHTML to readable text:
  //   - render <ac:structured-macro ac:name="code"> blocks as fenced code
  //   - drop other ac:/ri: macros
  //   - convert headings to "# ..." prefixes
  //   - convert tables to "Field: Value" lines (best-effort)
  //   - strip remaining tags
  //   - decode entities
  let s = storage

  // Replace code macros with fenced code blocks.
  s = s.replace(
    /<ac:structured-macro[^>]*ac:name=["']code["'][^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
    (_, inner) => {
      const langMatch = inner.match(
        /<ac:parameter[^>]*ac:name=["']language["'][^>]*>([^<]*)<\/ac:parameter>/
      )
      const bodyMatch = inner.match(
        /<ac:plain-text-body[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/
      )
      const lang = langMatch ? langMatch[1] : ""
      const body = bodyMatch ? bodyMatch[1] : ""
      return `\n\`\`\`${lang}\n${body}\n\`\`\`\n`
    }
  )
  // Drop info / note / etc. macros but keep their inner text.
  s = s.replace(
    /<ac:structured-macro[^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
    (_, inner) => inner
  )
  // Drop self-closing macros entirely.
  s = s.replace(/<ac:[^>]*\/>/g, "")
  s = s.replace(/<ri:[^>]*\/?>/g, "")
  // Convert headings.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, lvl, inner) => {
    const hashes = "#".repeat(Number(lvl))
    return `\n${hashes} ${stripInlineTags(inner).trim()}\n`
  })
  // Convert table rows of th/td to "label: value".
  s = s.replace(
    /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g,
    (_, th, td) => `\n${stripInlineTags(th).trim()}: ${stripInlineTags(td).trim()}`
  )
  // Convert list items.
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, inner) => `\n- ${stripInlineTags(inner).trim()}`)
  // Paragraphs → blank lines.
  s = s.replace(/<\/p>\s*<p[^>]*>/g, "\n\n")
  s = s.replace(/<\/?p[^>]*>/g, "\n")
  // Line breaks.
  s = s.replace(/<br\s*\/?>/g, "\n")
  // Strip remaining tags.
  s = stripInlineTags(s)
  // Decode entities.
  s = decodeEntities(s)
  // Collapse runs of blank lines.
  s = s.replace(/\n{3,}/g, "\n\n").trim()
  return s.slice(0, 30000)
}

function stripInlineTags(s: string): string {
  return s.replace(/<[^>]+>/g, "")
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
}

function extractJson(raw: string): { patches?: unknown[] } | null {
  // Tolerate fenced code blocks around the JSON.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : raw
  // Find the first { and last } to be tolerant of preface/suffix.
  const first = candidate.indexOf("{")
  const last = candidate.lastIndexOf("}")
  if (first === -1 || last === -1 || last < first) return null
  try {
    return JSON.parse(candidate.slice(first, last + 1))
  } catch {
    return null
  }
}

function buildPrompt(componentYaml: string, pageText: string): string {
  return `You are an architecture catalog change-detection agent.

A team has a component definition stored as YAML (the catalog source of truth) and a corresponding Confluence page. Users sometimes edit the Confluence page anywhere — the Properties table, the narrative chapters, or even comments — and the catalog must reflect those edits.

Your job: compare the current Confluence page to the YAML and propose precise field-level changes the user might want to apply back.

CATALOG YAML (current source of truth):
\`\`\`yaml
${componentYaml.slice(0, 8000)}
\`\`\`

CONFLUENCE PAGE TEXT (extracted from storage format):
\`\`\`
${pageText}
\`\`\`

EDITABLE FIELDS (only propose changes to these — use these exact dot-paths):
- name (string)
- status: must be "draft", "production", or "deprecated"
- owner (string)
- tags (array of strings — return as a comma-separated string in newValue)
- description.oneliner (string, short summary)
- description.technical (string, may be longer prose)
- description.business (string, may be longer prose)
- nfr.availability (string, e.g. "99.9%")
- nfr.rto (string, e.g. "1h")
- nfr.rpo (string)
- nfr.max_latency (string)
- nfr.throughput (string)
- nfr.data_classification: must be "public", "internal", "confidential", or "restricted"
- nfr.scaling: must be "horizontal", "vertical", or "none"

RULES:
- Only propose a change when the page has clear evidence of a value different from the YAML.
- Do NOT propose unchanged fields.
- Do NOT invent values. If uncertain, set confidence "low".
- For enum-constrained fields (status, nfr.data_classification, nfr.scaling), the new value MUST be a valid enum value. If the user wrote something invalid, omit that proposal.
- For description.technical and description.business: only propose changes if the user has clearly rewritten substantial portions of the prose. Trivial wording differences should be ignored.
- Provide a short "evidence" quote from the page (one sentence, max 200 chars) so the user can verify.
- Confidence: "high" when wording is unambiguous and explicit (e.g., a property labelled clearly), "medium" when reasonably implied, "low" when speculative.

Output ONLY a single JSON object with this exact shape:
{
  "patches": [
    {
      "field": "<dot-path>",
      "oldValue": "<current YAML value, stringified>",
      "newValue": "<proposed value, stringified>",
      "confidence": "high" | "medium" | "low",
      "evidence": "<short page quote>"
    }
  ]
}

If there are no changes, return {"patches": []}.
Output JSON only, no surrounding prose, no markdown fences.`
}

function mergePatches(table: SmartPatch[], ai: SmartPatch[]): SmartPatch[] {
  const out: SmartPatch[] = [...table]
  const seen = new Map<string, SmartPatch>()
  for (const p of out) seen.set(p.field, p)
  for (const p of ai) {
    const existing = seen.get(p.field)
    if (!existing) {
      out.push(p)
      seen.set(p.field, p)
    } else if (existing.newValue !== p.newValue) {
      // Different value — keep both so user can pick.
      out.push(p)
    }
    // If same value as table patch, drop the AI duplicate.
  }
  return out
}

interface ApplyArgs {
  componentId: string
  component: Awaited<ReturnType<typeof getComponent>>
  patches: SmartPatch[]
  pageId: string
  linkSha?: string
  pageVersion: number
  pageSpaceId: string
}

async function applyPatches(args: ApplyArgs): Promise<NextResponse> {
  const { component, patches } = args

  // Validate enums up front; return 400 if any invalid.
  for (const p of patches) {
    if (!ALLOWED_FIELDS.has(p.field)) {
      return NextResponse.json(
        { error: `Field "${p.field}" is not editable.` },
        { status: 400 }
      )
    }
    if (
      p.field === "status" &&
      p.newValue &&
      !COMPONENT_STATUSES.includes(p.newValue as ComponentStatus)
    ) {
      return NextResponse.json(
        {
          error: `Invalid status "${p.newValue}". Must be one of: ${COMPONENT_STATUSES.join(", ")}.`,
        },
        { status: 400 }
      )
    }
    if (p.field === "nfr.data_classification" && p.newValue) {
      if (resolveDataClassification(p.newValue) === null) {
        return NextResponse.json(
          {
            error: `Invalid Data Classification "${p.newValue}". Must be public, internal, confidential, or restricted.`,
          },
          { status: 400 }
        )
      }
    }
    if (p.field === "nfr.scaling" && p.newValue) {
      if (resolveScaling(p.newValue) === null) {
        return NextResponse.json(
          {
            error: `Invalid Scaling Model "${p.newValue}". Must be horizontal, vertical, or none.`,
          },
          { status: 400 }
        )
      }
    }
  }

  // Build merged component.
  const { sha: componentSha, ...rest } = component
  const updated: Record<string, unknown> = { ...rest }
  // Ensure nested objects exist.
  updated.description = { ...(component.description || { oneliner: "", technical: "", business: "" }) }
  const mergedNfr: ComponentNFR = { ...(component.nfr || {}) }

  for (const p of patches) {
    const v = p.newValue
    switch (p.field) {
      case "name":
        updated.name = v
        break
      case "status":
        if (v) updated.status = v as ComponentStatus
        break
      case "owner":
        updated.owner = v
        break
      case "tags":
        updated.tags = v
          ? v
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : []
        break
      case "description.oneliner":
        ;(updated.description as Record<string, string>).oneliner = v
        break
      case "description.technical":
        ;(updated.description as Record<string, string>).technical = v
        break
      case "description.business":
        ;(updated.description as Record<string, string>).business = v
        break
      case "nfr.availability":
      case "nfr.rto":
      case "nfr.rpo":
      case "nfr.max_latency":
      case "nfr.throughput": {
        const key = p.field.split(".")[1] as keyof ComponentNFR
        if (v === "") delete mergedNfr[key]
        else (mergedNfr as Record<string, unknown>)[key] = v
        break
      }
      case "nfr.data_classification": {
        const resolved = v ? resolveDataClassification(v) : undefined
        if (!v || resolved === undefined) delete mergedNfr.data_classification
        else if (resolved) mergedNfr.data_classification = resolved as DataClassification
        break
      }
      case "nfr.scaling": {
        const resolved = v ? resolveScaling(v) : undefined
        if (!v || resolved === undefined) delete mergedNfr.scaling
        else if (resolved) mergedNfr.scaling = resolved as ScalingModel
        break
      }
    }
  }

  if (Object.keys(mergedNfr).length > 0) {
    updated.nfr = mergedNfr
  } else {
    delete updated.nfr
  }

  // Strip any leftover sha from spread (already handled but defensive).
  delete (updated as Record<string, unknown>).sha

  await saveComponent(
    updated as unknown as Parameters<typeof saveComponent>[0],
    componentSha
  )

  // Best-effort side-file refresh.
  try {
    await saveConfluenceLink(
      {
        componentId: args.componentId,
        pageId: args.pageId,
        spaceId: args.pageSpaceId,
        lastSyncedAt: new Date().toISOString(),
        lastPublishedVersion: args.pageVersion,
      },
      args.linkSha
    )
  } catch (err) {
    console.warn(
      `saveConfluenceLink failed for ${args.componentId} (apply still succeeded):`,
      err instanceof Error ? err.message : err
    )
  }

  return NextResponse.json({
    applied: true,
    appliedCount: patches.length,
    confluenceVersion: args.pageVersion,
  })
}
