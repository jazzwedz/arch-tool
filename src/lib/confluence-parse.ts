// Parse a Confluence storage-format page body and extract the editable
// metadata fields produced by buildPropertiesTable() in confluence-render.ts.

import type { DataClassification, ScalingModel } from "./types"
import { DATA_CLASSIFICATION_LABELS } from "./constants"

export interface ParsedMetaPatch {
  name?: string
  status?: string
  owner?: string
  tags?: string[]
  oneliner?: string
  // NFR
  availability?: string
  rto?: string
  rpo?: string
  max_latency?: string
  throughput?: string
  data_classification?: string // raw value from Confluence; validated downstream
  scaling?: string // raw value
}

const FIELD_LABEL_TO_KEY: Record<string, keyof ParsedMetaPatch> = {
  Name: "name",
  Status: "status",
  Owner: "owner",
  Tags: "tags",
  Description: "oneliner",
  "Availability Target": "availability",
  RTO: "rto",
  RPO: "rpo",
  "Max Latency": "max_latency",
  Throughput: "throughput",
  "Data Classification": "data_classification",
  "Scaling Model": "scaling",
}

// Strip Confluence/HTML tags and decode entities to a plain text value.
function stripTagsAndDecode(s: string): string {
  // Remove storage-format macros that might appear inside cells (e.g. user mentions).
  let out = s.replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/g, "")
  // Strip remaining tags.
  out = out.replace(/<[^>]+>/g, "")
  // Decode entities.
  out = out
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
  return out.trim()
}

// Find the first <table data-arch-tool="properties">...</table> and parse rows.
// Confluence may strip the data attribute on user edits, so we also fall back
// to the first table that has at least one of our known field labels.
export function parseMetaTable(storageBody: string): ParsedMetaPatch {
  const patch: ParsedMetaPatch = {}

  // Try the marked table first.
  const markedTable = storageBody.match(
    /<table[^>]*data-arch-tool=["']properties["'][^>]*>([\s\S]*?)<\/table>/
  )

  // Fallback: find any table containing rows whose first cell matches our labels.
  const tables: string[] = markedTable
    ? [markedTable[1]]
    : Array.from(
        storageBody.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g),
        (m) => m[1]
      )

  for (const tableInner of tables) {
    const rowMatches = Array.from(
      tableInner.matchAll(
        /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g
      )
    )
    if (rowMatches.length === 0) continue

    let foundAny = false
    for (const m of rowMatches) {
      const labelRaw = stripTagsAndDecode(m[1])
      const valueRaw = stripTagsAndDecode(m[2])
      // Strip "(read-only)" suffix etc.
      const label = labelRaw.replace(/\s*\(.*?\)\s*$/, "").trim()
      const key = FIELD_LABEL_TO_KEY[label]
      if (!key) continue
      foundAny = true
      if (key === "tags") {
        patch.tags = valueRaw
          ? valueRaw
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : []
      } else {
        patch[key] = valueRaw as never
      }
    }
    if (foundAny) break
  }

  return patch
}

// Compute a human-readable summary of which fields differ between the catalog
// component and the parsed Confluence patch. Fields with empty values in the
// patch are treated as "clear this value" (intentional empty).
export interface FieldDiff {
  field: string
  oldValue: string
  newValue: string
}

export interface DiffInput {
  name: string
  status: string
  owner: string
  tags: string[]
  oneliner: string
  availability: string
  rto: string
  rpo: string
  max_latency: string
  throughput: string
  data_classification: string // human label, or raw key
  scaling: string
}

function trimEqual(a: string | undefined, b: string | undefined): boolean {
  return (a || "").trim() === (b || "").trim()
}

export function diffPatch(
  current: DiffInput,
  patch: ParsedMetaPatch
): FieldDiff[] {
  const out: FieldDiff[] = []
  const push = (field: string, oldV: string, newV: string) => {
    if (!trimEqual(oldV, newV)) {
      out.push({ field, oldValue: oldV, newValue: newV })
    }
  }
  if (patch.name !== undefined) push("name", current.name, patch.name)
  if (patch.status !== undefined) push("status", current.status, patch.status)
  if (patch.owner !== undefined) push("owner", current.owner, patch.owner)
  if (patch.tags !== undefined) {
    const a = current.tags.join(", ")
    const b = patch.tags.join(", ")
    if (a !== b) out.push({ field: "tags", oldValue: a, newValue: b })
  }
  if (patch.oneliner !== undefined) push("oneliner", current.oneliner, patch.oneliner)
  if (patch.availability !== undefined)
    push("nfr.availability", current.availability, patch.availability)
  if (patch.rto !== undefined) push("nfr.rto", current.rto, patch.rto)
  if (patch.rpo !== undefined) push("nfr.rpo", current.rpo, patch.rpo)
  if (patch.max_latency !== undefined)
    push("nfr.max_latency", current.max_latency, patch.max_latency)
  if (patch.throughput !== undefined)
    push("nfr.throughput", current.throughput, patch.throughput)
  if (patch.data_classification !== undefined)
    push("nfr.data_classification", current.data_classification, patch.data_classification)
  if (patch.scaling !== undefined) push("nfr.scaling", current.scaling, patch.scaling)
  return out
}

// Resolve a user-entered Data Classification value (may be label like "Confidential"
// or raw key like "confidential") to a canonical DataClassification. Returns
// undefined for empty input, null if value is invalid.
export function resolveDataClassification(
  raw: string
): DataClassification | undefined | null {
  const t = raw.trim()
  if (!t) return undefined
  const lower = t.toLowerCase()
  const canon = (Object.keys(DATA_CLASSIFICATION_LABELS) as DataClassification[]).find(
    (k) => k === lower || DATA_CLASSIFICATION_LABELS[k].toLowerCase() === lower
  )
  return canon ?? null
}

export function resolveScaling(raw: string): ScalingModel | undefined | null {
  const t = raw.trim()
  if (!t) return undefined
  const lower = t.toLowerCase()
  const valid: ScalingModel[] = ["horizontal", "vertical", "none"]
  return valid.includes(lower as ScalingModel) ? (lower as ScalingModel) : null
}
