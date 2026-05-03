// Parse a Confluence storage-format page body and extract the editable
// metadata fields produced by buildPropertiesTable() in confluence-render.ts.

export interface ParsedMetaPatch {
  name?: string
  status?: string
  owner?: string
  tags?: string[]
  oneliner?: string
}

const FIELD_LABEL_TO_KEY: Record<string, keyof ParsedMetaPatch> = {
  Name: "name",
  Status: "status",
  Owner: "owner",
  Tags: "tags",
  Description: "oneliner",
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
// component and the parsed Confluence patch.
export interface FieldDiff {
  field: string
  oldValue: string
  newValue: string
}

export function diffPatch(
  current: { name: string; status: string; owner: string; tags: string[]; oneliner: string },
  patch: ParsedMetaPatch
): FieldDiff[] {
  const out: FieldDiff[] = []
  if (patch.name !== undefined && patch.name !== current.name) {
    out.push({ field: "name", oldValue: current.name, newValue: patch.name })
  }
  if (patch.status !== undefined && patch.status !== current.status) {
    out.push({ field: "status", oldValue: current.status, newValue: patch.status })
  }
  if (patch.owner !== undefined && patch.owner !== current.owner) {
    out.push({ field: "owner", oldValue: current.owner, newValue: patch.owner })
  }
  if (patch.tags !== undefined) {
    const a = current.tags.join(", ")
    const b = patch.tags.join(", ")
    if (a !== b) out.push({ field: "tags", oldValue: a, newValue: b })
  }
  if (patch.oneliner !== undefined && patch.oneliner !== current.oneliner) {
    out.push({ field: "oneliner", oldValue: current.oneliner, newValue: patch.oneliner })
  }
  return out
}
