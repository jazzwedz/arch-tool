// Full-catalog text export, designed for LLM consumption.
//
// Produces a single markdown document that surfaces *every* field of
// *every* component — including the empty ones — so a model reading
// the export can answer two questions at once:
//
//   1. What do we have? (filled fields, declared edges, owners, …)
//   2. What is missing? (empty fields explicitly flagged with ❌ NOT
//      SET / ❌ NONE DEFINED rather than silently omitted).
//
// Structure:
//
//   - Header (timestamp, totals)
//   - At-a-glance summary (counts by type / status, average maturity,
//     repo-wide gap stats)
//   - Coverage matrix (compact one-line-per-component overview)
//   - Cross-cutting index (capabilities, processes, external labels)
//   - Per-component detail blocks
//
// Pure function — no I/O. The caller (a route or a client component)
// supplies the components array and an optional `generatedAt` string
// so the same input always produces byte-identical output (handy when
// piping into git or diffing across days).

import type { Component, ComponentInterface, DataItem } from "./types"
import {
  TYPE_LABELS,
  RELATIONSHIP_LABELS,
  INVERSE_RELATIONSHIP_LABELS,
  DATA_KIND_LABELS,
  CAPABILITY_ROLE_LABELS,
  PROCESS_ROLE_LABELS,
  RULE_KIND_LABELS,
} from "./constants"
import { computeMaturity } from "./component-maturity"

const MISSING_FIELD = "❌ NOT SET"
const MISSING_LIST = "❌ NONE DEFINED"
const MISSING_BLOCK = "❌ NONE"

export interface CatalogExportOptions {
  /** ISO date string. Defaults to `"unknown"` so the function stays pure. */
  generatedAt?: string
}

interface BacklinkBundle {
  relationships: Array<{ from: Component; type: string; connector?: string; description?: string }>
  interfaces: Array<{ from: Component; iface: ComponentInterface }>
  inputSources: Array<{ from: Component; dataItem: DataItem }>
  outputConsumers: Array<{ from: Component; dataItem: DataItem }>
}

export function buildCatalogMarkdown(
  components: Component[],
  options: CatalogExportOptions = {}
): string {
  const generatedAt = options.generatedAt ?? "unknown"
  const sorted = [...components].sort((a, b) => a.id.localeCompare(b.id))
  const backlinks = buildBacklinkIndex(sorted)
  const out: string[] = []

  // -------- header --------
  out.push(`# Catalog Export`)
  out.push(``)
  out.push(`Generated for LLM consumption. Every component below shows`)
  out.push(`every field of the data model — missing fields are flagged`)
  out.push(`explicitly with ${MISSING_FIELD}, ${MISSING_LIST} or ${MISSING_BLOCK}`)
  out.push(`so a model can identify gaps without re-reading the schema.`)
  out.push(``)
  out.push(`- **Generated at:** ${generatedAt}`)
  out.push(`- **Total components:** ${sorted.length}`)
  out.push(``)
  out.push(`> The canonical schema reference lives in`)
  out.push(`> \`docs/COMPONENT_MODEL.md\`. Pair this export with that doc`)
  out.push(`> when asking the model to audit / extend the catalog.`)
  out.push(``)

  // -------- at-a-glance --------
  out.push(`## At-a-glance`)
  out.push(``)
  out.push(...renderAtAGlance(sorted))
  out.push(``)

  // -------- coverage matrix --------
  out.push(`## Coverage matrix`)
  out.push(``)
  out.push(...renderCoverageMatrix(sorted))
  out.push(``)

  // -------- cross-cutting index --------
  out.push(`## Cross-cutting index`)
  out.push(``)
  out.push(...renderCrossCutting(sorted))
  out.push(``)

  // -------- per-component --------
  out.push(`## Components`)
  out.push(``)
  for (const c of sorted) {
    out.push(...renderComponent(c, backlinks))
    out.push(``)
    out.push(`---`)
    out.push(``)
  }

  return out.join("\n")
}

// ============================ at-a-glance ============================

function renderAtAGlance(components: Component[]): string[] {
  const lines: string[] = []

  // By type
  const byType = new Map<string, number>()
  for (const c of components) byType.set(c.type, (byType.get(c.type) ?? 0) + 1)
  const typeRows = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])
  if (typeRows.length > 0) {
    lines.push(`**By type:** ${typeRows.map(([t, n]) => `${TYPE_LABELS[t as keyof typeof TYPE_LABELS] ?? t} (${n})`).join(", ")}`)
    lines.push(``)
  }

  // By status
  const byStatus = new Map<string, number>()
  for (const c of components) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)
  const statusRows = Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1])
  if (statusRows.length > 0) {
    lines.push(`**By status:** ${statusRows.map(([s, n]) => `${s} (${n})`).join(", ")}`)
    lines.push(``)
  }

  // By owner
  const byOwner = new Map<string, number>()
  for (const c of components) {
    const o = c.owner?.trim() || "(unowned)"
    byOwner.set(o, (byOwner.get(o) ?? 0) + 1)
  }
  const ownerRows = Array.from(byOwner.entries()).sort((a, b) => b[1] - a[1])
  if (ownerRows.length > 0) {
    lines.push(`**By owner:** ${ownerRows.map(([o, n]) => `${o} (${n})`).join(", ")}`)
    lines.push(``)
  }

  // Maturity
  if (components.length > 0) {
    let totalPercent = 0
    const bands: Record<string, number> = {
      Skeletal: 0,
      Drafted: 0,
      Solid: 0,
      Complete: 0,
    }
    for (const c of components) {
      const m = computeMaturity(c)
      totalPercent += m.percent
      bands[m.bandLabel] = (bands[m.bandLabel] ?? 0) + 1
    }
    const avg = Math.round(totalPercent / components.length)
    lines.push(`**Average documentation maturity:** ${avg}%`)
    lines.push(``)
    lines.push(
      `**Maturity bands:** Complete (${bands.Complete}), Solid (${bands.Solid}), Drafted (${bands.Drafted}), Skeletal (${bands.Skeletal})`
    )
    lines.push(``)
  }

  // Gap stats — count how many components miss each maturity field
  if (components.length > 0) {
    const gapCounts = new Map<string, { label: string; count: number }>()
    for (const c of components) {
      const m = computeMaturity(c)
      for (const f of m.fields) {
        if (!f.filled) {
          const cur = gapCounts.get(f.key) ?? { label: f.label, count: 0 }
          cur.count++
          gapCounts.set(f.key, cur)
        }
      }
    }
    const sorted = Array.from(gapCounts.entries()).sort((a, b) => b[1].count - a[1].count)
    if (sorted.length > 0) {
      lines.push(`**Repo-wide gaps** (components missing each field):`)
      lines.push(``)
      for (const [, { label, count }] of sorted) {
        const pct = Math.round((count / components.length) * 100)
        lines.push(`- ${label}: **${count}** / ${components.length} (${pct}%) missing`)
      }
    }
  }

  return lines
}

// ============================ coverage matrix ============================

function renderCoverageMatrix(components: Component[]): string[] {
  const lines: string[] = []
  lines.push(
    `| ID | Name | Type | Status | Owner | Maturity | Desc | Ifaces | Rels | Caps | Procs | Rules | Data (I/O/Owns) | NFR | Risks |`
  )
  lines.push(
    `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`
  )
  for (const c of components) {
    const m = computeMaturity(c)
    const desc = m.fields.find((f) => f.key === "description")?.filled ? "✓" : "❌"
    const ifaces = (c.interfaces || []).length
    const rels = (c.relationships || []).length
    const caps = (c.capabilities || []).length
    const procs = (c.processes || []).length
    const rules = (c.rules || []).length
    const ins = (c.data?.inputs || []).length
    const outs = (c.data?.outputs || []).length
    const owns = (c.data?.owns || []).length
    const dataStr = ins + outs + owns === 0 ? "❌" : `${ins}/${outs}/${owns}`
    const nfr =
      c.nfr && Object.values(c.nfr).some((v) => !!v) ? "✓" : "❌"
    const risks = (c.risks || []).length
    lines.push(
      `| \`${c.id}\` | ${c.name} | ${c.type} | ${c.status} | ${c.owner || "❌"} | ${m.percent}% | ${desc} | ${ifaces || "❌"} | ${rels || "❌"} | ${caps || "❌"} | ${procs || "❌"} | ${rules || "❌"} | ${dataStr} | ${nfr} | ${risks || "❌"} |`
    )
  }
  return lines
}

// ============================ cross-cutting ============================

function renderCrossCutting(components: Component[]): string[] {
  const lines: string[] = []

  // Capabilities — name → [{component, role}]
  const capMap = new Map<string, { id: string; name: string; role: string }[]>()
  for (const c of components) {
    for (const cap of c.capabilities || []) {
      const arr = capMap.get(cap.name) ?? []
      arr.push({ id: c.id, name: c.name, role: cap.role })
      capMap.set(cap.name, arr)
    }
  }
  if (capMap.size > 0) {
    lines.push(`### Capabilities`)
    lines.push(``)
    const sortedCaps = Array.from(capMap.entries()).sort()
    for (const [cap, refs] of sortedCaps) {
      lines.push(
        `- **${cap}** — ${refs.map((r) => `${r.name} (${CAPABILITY_ROLE_LABELS[r.role as keyof typeof CAPABILITY_ROLE_LABELS] ?? r.role})`).join(", ")}`
      )
    }
    lines.push(``)
  } else {
    lines.push(`### Capabilities`)
    lines.push(``)
    lines.push(`${MISSING_LIST} (no component declares any capability).`)
    lines.push(``)
  }

  // Processes — name → [{component, role}]
  const procMap = new Map<string, { id: string; name: string; role: string }[]>()
  for (const c of components) {
    for (const p of c.processes || []) {
      const arr = procMap.get(p.name) ?? []
      arr.push({ id: c.id, name: c.name, role: p.role })
      procMap.set(p.name, arr)
    }
  }
  if (procMap.size > 0) {
    lines.push(`### Processes`)
    lines.push(``)
    const sortedProcs = Array.from(procMap.entries()).sort()
    for (const [proc, refs] of sortedProcs) {
      lines.push(
        `- **${proc}** — ${refs.map((r) => `${r.name} (${PROCESS_ROLE_LABELS[r.role as keyof typeof PROCESS_ROLE_LABELS] ?? r.role})`).join(", ")}`
      )
    }
    lines.push(``)
  }

  // External labels referenced — targets that are NOT in the catalog
  const idSet = new Set(components.map((c) => c.id))
  const externalTargets = new Map<string, { id: string; name: string; via: string }[]>()
  for (const c of components) {
    for (const iface of c.interfaces || []) {
      if (iface.target && !idSet.has(iface.target)) {
        const arr = externalTargets.get(iface.target) ?? []
        arr.push({ id: c.id, name: c.name, via: `interface (${iface.direction} ${iface.type})` })
        externalTargets.set(iface.target, arr)
      }
    }
    for (const rel of c.relationships || []) {
      if (rel.target && !idSet.has(rel.target)) {
        const arr = externalTargets.get(rel.target) ?? []
        arr.push({ id: c.id, name: c.name, via: `relationship (${rel.type})` })
        externalTargets.set(rel.target, arr)
      }
    }
    for (const inp of c.data?.inputs || []) {
      if (inp.source && !idSet.has(inp.source)) {
        const arr = externalTargets.get(inp.source) ?? []
        arr.push({ id: c.id, name: c.name, via: `data input (${inp.name})` })
        externalTargets.set(inp.source, arr)
      }
    }
    for (const out of c.data?.outputs || []) {
      for (const cons of out.consumers || []) {
        if (cons && !idSet.has(cons)) {
          const arr = externalTargets.get(cons) ?? []
          arr.push({ id: c.id, name: c.name, via: `data output consumer (${out.name})` })
          externalTargets.set(cons, arr)
        }
      }
    }
  }
  if (externalTargets.size > 0) {
    lines.push(`### External / unknown targets referenced`)
    lines.push(``)
    lines.push(`These ids appear as targets but do **not** correspond to`)
    lines.push(`any component in the catalog. They are either external`)
    lines.push(`systems modelled as free labels, or broken references.`)
    lines.push(``)
    const sortedExt = Array.from(externalTargets.entries()).sort()
    for (const [t, refs] of sortedExt) {
      lines.push(
        `- \`${t}\` — referenced by ${refs.map((r) => `${r.name} (${r.via})`).join(", ")}`
      )
    }
    lines.push(``)
  }

  return lines
}

// ============================ per-component ============================

function renderComponent(c: Component, backlinks: Map<string, BacklinkBundle>): string[] {
  const lines: string[] = []
  const m = computeMaturity(c)

  lines.push(`### \`${c.id}\` — ${c.name}`)
  lines.push(``)
  lines.push(`- **Type:** ${c.type} (${TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] ?? c.type})`)
  lines.push(`- **Status:** ${c.status}`)
  lines.push(`- **Owner:** ${c.owner?.trim() || MISSING_FIELD}`)
  lines.push(`- **Tags:** ${(c.tags || []).length > 0 ? c.tags.join(", ") : MISSING_BLOCK}`)
  lines.push(`- **Documentation maturity:** ${m.percent}% (${m.filled}/${m.total} fields) — ${m.bandLabel}`)
  lines.push(``)

  // Description
  lines.push(`**Description**`)
  lines.push(``)
  const descText =
    c.description?.description?.trim() ||
    c.description?.technical?.trim() ||
    c.description?.business?.trim()
  if (descText) {
    for (const ln of descText.split("\n")) lines.push(`> ${ln}`)
  } else {
    lines.push(`> ${MISSING_FIELD}`)
  }
  if (c.description?.oneliner?.trim()) {
    lines.push(``)
    lines.push(`*One-liner:* ${c.description.oneliner.trim()}`)
  }
  lines.push(``)

  // Interfaces
  lines.push(`**Interfaces (${(c.interfaces || []).length})**`)
  lines.push(``)
  if ((c.interfaces || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const iface of c.interfaces) {
      const head = iface.name ? `"${iface.name}"` : ""
      const target = iface.target ? ` → \`${iface.target}\`` : " → (no target)"
      lines.push(
        `- [${iface.direction}] [${iface.type}] ${head}${target}`
      )
      if (iface.description?.trim()) {
        lines.push(`  ${iface.description.trim()}`)
      }
    }
  }
  lines.push(``)

  // Outbound relationships
  lines.push(`**Outbound relationships (${(c.relationships || []).length})**`)
  lines.push(``)
  if ((c.relationships || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const rel of c.relationships) {
      const label = RELATIONSHIP_LABELS[rel.type] ?? rel.type
      const conn = rel.connector ? ` (${rel.connector})` : ""
      lines.push(
        `- ${label} → \`${rel.target || "(no target)"}\`${conn}${rel.description ? ` — ${rel.description}` : ""}`
      )
    }
  }
  lines.push(``)

  // Inbound (backlinks)
  const bl = backlinks.get(c.id)
  lines.push(`**Inbound (declared on other components)**`)
  lines.push(``)
  if (!bl || (bl.relationships.length === 0 && bl.interfaces.length === 0 && bl.inputSources.length === 0 && bl.outputConsumers.length === 0)) {
    lines.push(MISSING_BLOCK)
  } else {
    if (bl.relationships.length > 0) {
      lines.push(`- *Relationships pointing here:*`)
      for (const r of bl.relationships) {
        const inv =
          INVERSE_RELATIONSHIP_LABELS[r.type] ?? r.type
        lines.push(
          `  - ${r.from.name} (\`${r.from.id}\`) declares "${r.type}" → reads here as "${inv}"`
        )
      }
    }
    if (bl.interfaces.length > 0) {
      lines.push(`- *Interfaces pointing here:*`)
      for (const r of bl.interfaces) {
        lines.push(
          `  - ${r.from.name} (\`${r.from.id}\`) ${r.iface.direction} ${r.iface.type}${r.iface.name ? ` "${r.iface.name}"` : ""}`
        )
      }
    }
    if (bl.inputSources.length > 0) {
      lines.push(`- *Components reading from here as input source:*`)
      for (const r of bl.inputSources) {
        lines.push(
          `  - ${r.from.name} (\`${r.from.id}\`) reads "${r.dataItem.name}" [${r.dataItem.kind}]`
        )
      }
    }
    if (bl.outputConsumers.length > 0) {
      lines.push(`- *Components declaring this one as their output consumer:*`)
      for (const r of bl.outputConsumers) {
        lines.push(
          `  - ${r.from.name} (\`${r.from.id}\`) emits "${r.dataItem.name}" [${r.dataItem.kind}] to here`
        )
      }
    }
  }
  lines.push(``)

  // Capabilities
  lines.push(`**Capabilities (${(c.capabilities || []).length})**`)
  lines.push(``)
  if ((c.capabilities || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const cap of c.capabilities!) {
      const role = CAPABILITY_ROLE_LABELS[cap.role] ?? cap.role
      lines.push(`- ${cap.name} [${role}]${cap.description ? ` — ${cap.description}` : ""}`)
    }
  }
  lines.push(``)

  // Processes
  lines.push(`**Processes (${(c.processes || []).length})**`)
  lines.push(``)
  if ((c.processes || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const p of c.processes!) {
      const role = PROCESS_ROLE_LABELS[p.role] ?? p.role
      lines.push(
        `- ${p.name} [${role}]${p.activity ? ` — ${p.activity}` : ""}${p.description ? ` (${p.description})` : ""}`
      )
    }
  }
  lines.push(``)

  // Rules
  lines.push(`**Rules & calculations (${(c.rules || []).length})**`)
  lines.push(``)
  if ((c.rules || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const r of c.rules!) {
      const kind = RULE_KIND_LABELS[r.kind] ?? r.kind
      lines.push(`- [${kind}] **${r.name}**${r.summary ? ` — ${r.summary}` : ""}`)
      if (r.kind === "formula" && r.formula) {
        lines.push(`  Formula: \`${r.formula}\``)
      }
      if (r.kind === "rule") {
        if (r.given) lines.push(`  Given: ${r.given}`)
        if (r.when) lines.push(`  When: ${r.when}`)
        if (r.then) lines.push(`  Then: ${r.then}`)
      }
      if (r.kind === "constraint" && r.enforced_in && r.enforced_in.length > 0) {
        lines.push(`  Enforced in: ${r.enforced_in.map((id) => `\`${id}\``).join(", ")}`)
      }
      if (r.description) {
        lines.push(`  ${r.description}`)
      }
    }
  }
  lines.push(``)

  // Data
  const ins = c.data?.inputs || []
  const outs = c.data?.outputs || []
  const owns = c.data?.owns || []
  lines.push(`**Data flow** — Inputs: ${ins.length} · Outputs: ${outs.length} · Owns: ${owns.length}`)
  lines.push(``)
  if (ins.length === 0 && outs.length === 0 && owns.length === 0) {
    lines.push(MISSING_LIST)
  } else {
    if (owns.length > 0) {
      lines.push(`- *Owns (source-of-truth):*`)
      for (const it of owns) lines.push(`  - ${renderDataItem(it, "owns")}`)
    } else {
      lines.push(`- Owns: ${MISSING_BLOCK}`)
    }
    if (ins.length > 0) {
      lines.push(`- *Inputs (consumed by this component):*`)
      for (const it of ins) lines.push(`  - ${renderDataItem(it, "inputs")}`)
    } else {
      lines.push(`- Inputs: ${MISSING_BLOCK}`)
    }
    if (outs.length > 0) {
      lines.push(`- *Outputs (emitted by this component):*`)
      for (const it of outs) lines.push(`  - ${renderDataItem(it, "outputs")}`)
    } else {
      lines.push(`- Outputs: ${MISSING_BLOCK}`)
    }
  }
  lines.push(``)

  // NFR
  lines.push(`**Non-functional requirements**`)
  lines.push(``)
  const nfr = c.nfr || {}
  const nfrFields: Array<[string, string | undefined]> = [
    ["Availability", nfr.availability],
    ["RTO", nfr.rto],
    ["RPO", nfr.rpo],
    ["Max latency", nfr.max_latency],
    ["Throughput", nfr.throughput],
    ["Data classification", nfr.data_classification],
    ["Scaling", nfr.scaling],
  ]
  let nfrAny = false
  for (const [label, val] of nfrFields) {
    if (val) {
      lines.push(`- ${label}: ${val}`)
      nfrAny = true
    } else {
      lines.push(`- ${label}: ${MISSING_FIELD}`)
    }
  }
  if (!nfrAny) {
    lines.push(``)
    lines.push(`(every NFR field unset)`)
  }
  lines.push(``)

  // Diagram
  lines.push(`**Diagram overrides**`)
  lines.push(``)
  if (c.diagram?.color || c.diagram?.shape) {
    if (c.diagram.color) lines.push(`- Color: ${c.diagram.color}`)
    if (c.diagram.shape) lines.push(`- Shape: ${c.diagram.shape}`)
  } else {
    lines.push(MISSING_BLOCK)
  }
  lines.push(``)

  // Risks
  lines.push(`**Risks (${(c.risks || []).length})**`)
  lines.push(``)
  if ((c.risks || []).length === 0) {
    lines.push(MISSING_LIST)
  } else {
    for (const r of c.risks!) lines.push(`- ${r}`)
  }
  lines.push(``)

  // Data-model link (table-only)
  if (c.type === "table") {
    lines.push(`**Data Model registry link** (table only)`)
    lines.push(``)
    if (c.data_model?.entity) {
      lines.push(`- Entity: \`${c.data_model.entity}\``)
    } else {
      lines.push(MISSING_FIELD)
    }
    lines.push(``)
  }

  // Missing field summary
  const missing = m.fields.filter((f) => !f.filled).map((f) => f.label)
  lines.push(`**Missing / empty fields:** ${missing.length === 0 ? "none — complete ✓" : missing.join(", ")}`)

  return lines
}

function renderDataItem(it: DataItem, bucket: "inputs" | "outputs" | "owns"): string {
  const kind = DATA_KIND_LABELS[it.kind] ?? it.kind
  const parts: string[] = [`**${it.name}** [${kind}]`]
  if (bucket === "inputs") {
    parts.push(it.source ? `← \`${it.source}\`` : `← ${MISSING_FIELD}`)
  }
  if (bucket === "outputs") {
    if (it.consumers && it.consumers.length > 0) {
      parts.push(`→ ${it.consumers.map((c) => `\`${c}\``).join(", ")}`)
    } else {
      parts.push(`→ ${MISSING_FIELD}`)
    }
  }
  if (it.purpose) parts.push(`(${it.purpose})`)
  if (it.description) parts.push(`— ${it.description}`)
  return parts.join(" ")
}

// ============================ backlink index ============================

function buildBacklinkIndex(components: Component[]): Map<string, BacklinkBundle> {
  const map = new Map<string, BacklinkBundle>()
  const ensure = (id: string): BacklinkBundle => {
    let bundle = map.get(id)
    if (!bundle) {
      bundle = {
        relationships: [],
        interfaces: [],
        inputSources: [],
        outputConsumers: [],
      }
      map.set(id, bundle)
    }
    return bundle
  }

  for (const c of components) {
    for (const rel of c.relationships || []) {
      if (!rel.target) continue
      ensure(rel.target).relationships.push({
        from: c,
        type: rel.type,
        connector: rel.connector,
        description: rel.description,
      })
    }
    for (const iface of c.interfaces || []) {
      if (!iface.target) continue
      ensure(iface.target).interfaces.push({ from: c, iface })
    }
    for (const inp of c.data?.inputs || []) {
      if (!inp.source) continue
      ensure(inp.source).inputSources.push({ from: c, dataItem: inp })
    }
    for (const out of c.data?.outputs || []) {
      for (const cons of out.consumers || []) {
        if (!cons) continue
        ensure(cons).outputConsumers.push({ from: c, dataItem: out })
      }
    }
  }
  return map
}
