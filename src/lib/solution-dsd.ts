// DSD (Detailed Solution Description) generation as a small in-process
// orchestration: deterministic grounding → draft → critic → revise loop.
//
// The solution + its members are structured data, so we compute the
// "verified facts" (inventory, capability/process mapping, dependencies,
// NFR rollup, flows, diagram) in code and hand them to the model as
// ground truth. The model writes prose around them; a critic pass checks
// the draft against those facts and a bounded revise loop fixes issues.
//
// Runs as a fire-and-forget job (the app is a single long-running node
// server) so the multi-call flow survives gateway request timeouts; the
// client polls for phase + result. Reuses the existing LLM client, so it
// goes through the same corp gateway as everything else.

import { randomUUID } from "crypto"
import { getLLM } from "./llm"
import { buildSolutionMermaid } from "./architecture-mermaid"
import type { Component, Solution, SolutionMember } from "./types"
import { getLogger } from "./log"

// ----------------------------- job store -----------------------------

export type DsdPhase = "grounding" | "drafting" | "reviewing" | "revising" | "done" | "error"

export interface DsdJob {
  status: "running" | "done" | "error"
  phase: DsdPhase
  markdown?: string
  error?: string
  iterations?: number
  updatedAt: number
}

const jobs = new Map<string, DsdJob>()
const JOB_TTL_MS = 30 * 60 * 1000

function prune() {
  const now = Date.now()
  for (const [id, j] of jobs) if (now - j.updatedAt > JOB_TTL_MS) jobs.delete(id)
}

export function getDsdJob(id: string): DsdJob | undefined {
  return jobs.get(id)
}

export function startDsdJob(solution: Solution, components: Component[]): string {
  prune()
  const id = randomUUID()
  jobs.set(id, { status: "running", phase: "grounding", updatedAt: Date.now() })
  // Detached — keeps running after the POST response returns.
  runDsd(id, solution, components).catch((e) => {
    getLogger().error("DSD job crashed", { id, err: e instanceof Error ? e.message : String(e) })
    jobs.set(id, {
      status: "error",
      phase: "error",
      error: e instanceof Error ? e.message : String(e),
      updatedAt: Date.now(),
    })
  })
  return id
}

function setPhase(id: string, phase: DsdPhase, extra?: Partial<DsdJob>) {
  const cur = jobs.get(id)
  jobs.set(id, { ...cur, ...extra, status: "running", phase, updatedAt: Date.now() })
}

async function runDsd(id: string, solution: Solution, components: Component[]): Promise<void> {
  const facts = buildGroundedFacts(solution, components)
  setPhase(id, "drafting")
  const llm = await getLLM()

  let draft = await llm.complete({ prompt: draftPrompt(solution, facts), maxTokens: 4096 })

  let iterations = 0
  for (let i = 0; i < 2; i++) {
    setPhase(id, "reviewing", { iterations })
    const review = await llm.complete({ prompt: criticPrompt(facts, draft), maxTokens: 1500 })
    const verdict = parseVerdict(review)
    if (verdict.ok || verdict.issues.length === 0) break
    iterations++
    setPhase(id, "revising", { iterations })
    draft = await llm.complete({
      prompt: revisePrompt(facts, draft, verdict.issues),
      maxTokens: 4096,
    })
  }

  jobs.set(id, { status: "done", phase: "done", markdown: draft, iterations, updatedAt: Date.now() })
  getLogger().info("DSD job done", { id, iterations })
}

// --------------------------- grounded facts ---------------------------

const DC_ORDER = ["public", "internal", "confidential", "restricted"]

export function buildGroundedFacts(solution: Solution, components: Component[]): string {
  const byId = new Map(components.map((c) => [c.id, c]))
  const members = solution.members || []
  const memberIds = new Set(members.map((m) => m.component))
  const label = (cid: string) => byId.get(cid)?.name || cid

  const lines: string[] = []
  lines.push(`# VERIFIED FACTS — use these exactly; do NOT invent components, flows or values not listed here.`)
  lines.push("")
  lines.push(`## Solution`)
  lines.push(`- Name: ${solution.name}`)
  lines.push(`- Status: ${solution.status}`)
  if (solution.owner) lines.push(`- Owner: ${solution.owner}`)
  if (solution.goal) lines.push(`- Goal: ${solution.goal}`)
  if (solution.description?.description)
    lines.push(`- Description: ${solution.description.description}`)
  lines.push("")

  // Inventory
  lines.push(`## Members (component inventory) — the ONLY components in this solution`)
  lines.push(`| Component | Type | Disposition | Role in solution | Status | Owner |`)
  lines.push(`|---|---|---|---|---|---|`)
  for (const m of members) {
    const c = byId.get(m.component)
    lines.push(
      `| ${label(m.component)} | ${c?.type || "?"} | ${m.disposition} | ${m.role || "-"} | ${c?.status || "?"} | ${c?.owner || "-"} |`
    )
  }
  lines.push("")

  // Capability / process mapping + gaps
  const caps = solution.delivers?.capabilities || []
  const procs = solution.delivers?.processes || []
  if (caps.length || procs.length) {
    lines.push(`## Capability & process mapping`)
    const findCovering = (name: string, kind: "capability" | "process") => {
      const hits: string[] = []
      for (const m of members) {
        const c = byId.get(m.component)
        if (!c) {
          // new component not in catalog snapshot — count it as a provider
          if (m.disposition === "new") hits.push(`${m.component} (new)`)
          continue
        }
        const arr = kind === "capability" ? c.capabilities || [] : c.processes || []
        if (arr.some((x) => x.name?.toLowerCase() === name.toLowerCase()))
          hits.push(`${c.name}${m.disposition === "new" ? " (new)" : ""}`)
        else if (m.disposition === "new") hits.push(`${c.name} (new)`)
      }
      return hits
    }
    for (const cap of caps) {
      const hits = findCovering(cap, "capability")
      lines.push(`- Capability "${cap}" → ${hits.length ? hits.join(", ") : "GAP — no member provides it (needs a new component)"}`)
    }
    for (const p of procs) {
      const hits = findCovering(p, "process")
      lines.push(`- Process "${p}" → ${hits.length ? hits.join(", ") : "GAP — no member supports it (needs a new component)"}`)
    }
    lines.push("")
  }

  // Flows
  const flows = solution.flows || []
  if (flows.length) {
    lines.push(`## Flows`)
    for (const f of flows) {
      lines.push(`- ${label(f.from)} → ${label(f.to)} — ${f.role}${f.protocol ? `/${f.protocol}` : ""} (${f.status})`)
    }
    lines.push("")
  }

  // Dependencies (member links pointing outside the solution)
  const deps: string[] = []
  for (const m of members) {
    const c = byId.get(m.component)
    for (const l of c?.links || []) {
      if (l.target && !memberIds.has(l.target)) {
        deps.push(`- ${c?.name} → ${label(l.target)} (${l.role}${l.protocol ? `/${l.protocol}` : ""}) — external to this solution`)
      }
    }
  }
  if (deps.length) {
    lines.push(`## External dependencies`)
    lines.push(...deps)
    lines.push("")
  }

  // NFR rollup
  const nfrLines: string[] = []
  if (solution.nfr && Object.keys(solution.nfr).length)
    nfrLines.push(`- Solution targets: ${JSON.stringify(solution.nfr)}`)
  let maxDc = -1
  for (const m of members) {
    const c = byId.get(m.component)
    if (c?.nfr) nfrLines.push(`- ${c.name}: ${JSON.stringify(c.nfr)}`)
    const dc = c?.nfr?.data_classification
    if (dc) maxDc = Math.max(maxDc, DC_ORDER.indexOf(dc))
  }
  if (maxDc >= 0) nfrLines.push(`- Highest data classification across members: ${DC_ORDER[maxDc]}`)
  if (nfrLines.length) {
    lines.push(`## Non-functional requirements`)
    lines.push(...nfrLines)
    lines.push("")
  }

  // Risks
  const risks: string[] = [...(solution.risks || [])]
  for (const m of members) {
    const c = byId.get(m.component)
    for (const r of c?.risks || []) risks.push(`${c?.name}: ${r}`)
  }
  if (risks.length) {
    lines.push(`## Risks`)
    for (const r of risks) lines.push(`- ${r}`)
    lines.push("")
  }

  // Business rules
  const ruleLines: string[] = []
  for (const m of members) {
    const c = byId.get(m.component)
    for (const r of c?.rules || []) {
      ruleLines.push(`- [${c?.name}] ${r.name} (${r.kind})${r.summary ? ` — ${r.summary}` : ""}`)
    }
  }
  if (ruleLines.length) {
    lines.push(`## Business rules (from members)`)
    lines.push(...ruleLines)
    lines.push("")
  }

  // Diagram
  lines.push(`## Architecture diagram (use this mermaid block verbatim in the architecture section)`)
  lines.push("```mermaid")
  lines.push(buildSolutionMermaid(members, components, flows))
  lines.push("```")

  return lines.join("\n")
}

// ------------------------------ prompts -------------------------------

const STYLE = `Write like a knowledgeable colleague — clear, direct, no fluff. Short sentences. No marketing words (leverage, robust, seamless, synergy, holistic, empower, streamline). State facts plainly.`

function draftPrompt(solution: Solution, facts: string): string {
  return `You are a solution architect writing a Detailed Solution Description (DSD) in Markdown. ${STYLE}

Base the document STRICTLY on the verified facts below. Do not introduce components, flows, capabilities or values that are not in the facts. Where you reason beyond the data (e.g. sequencing the roadmap), say so plainly.

${facts}

Produce the DSD with these chapters, in order:

# ${solution.name} — Detailed Solution Description

## Table of Contents
(numbered list of the chapters below)

## 1. Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [today's date] | Auto-generated | Initial version |

## 2. Executive Summary
What the solution does and the business goal. Two short paragraphs.

## 3. Business Context
The capabilities and processes it delivers, and why they matter.

## 4. Scope
In scope: the member components. Anything not listed is out of scope.

## 5. Solution Architecture
The component inventory table (from the facts) and 2-3 sentences on how the pieces fit. Then include the architecture mermaid block from the facts verbatim.

## 6. Capability & Process Mapping
The mapping from the facts. Call out any GAP that needs a new component.

## 7. Non-Functional Requirements
The NFR targets and the highest data classification, from the facts.

## 8. Dependencies
The external dependencies from the facts (or "none" if there are none).

## 9. Risks & Assumptions
The risks from the facts plus any explicit assumptions you make.

## 10. Business Rules
The business rules from the facts (or "none captured yet").

## 11. Implementation Roadmap
Group the work by disposition: reuse as-is, extend, new to build. Note readiness (which members are still draft).

Output only the Markdown document.`
}

function criticPrompt(facts: string, draft: string): string {
  return `You are reviewing a Detailed Solution Description draft against the verified facts it must be based on. Find ONLY real problems.

Flag an issue when the draft:
- mentions a component, flow, capability or value that is NOT in the facts (invention),
- contradicts the facts,
- omits a required chapter (1-11),
- states an NFR / risk / rule that the facts do not support.

VERIFIED FACTS:
${facts}

DRAFT:
${draft}

Return ONLY JSON, no prose:
{ "ok": boolean, "issues": [ { "section": "chapter or topic", "problem": "what is wrong and how to fix" } ] }
"ok" is true when there are no real problems. Be strict about inventions, lenient about style.`
}

function revisePrompt(facts: string, draft: string, issues: { section: string; problem: string }[]): string {
  const issueList = issues.map((i, n) => `${n + 1}. [${i.section}] ${i.problem}`).join("\n")
  return `Revise the Detailed Solution Description below to fix the listed issues. Keep everything that is correct; change only what the issues require. Stay strictly within the verified facts. ${STYLE}

VERIFIED FACTS:
${facts}

ISSUES TO FIX:
${issueList}

CURRENT DRAFT:
${draft}

Output only the full corrected Markdown document.`
}

interface Verdict {
  ok: boolean
  issues: { section: string; problem: string }[]
}

function parseVerdict(text: string): Verdict {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const body = fenced ? fenced[1] : text
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start < 0 || end < 0) return { ok: true, issues: [] }
    const parsed = JSON.parse(body.slice(start, end + 1)) as Partial<Verdict>
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .filter((i) => i && typeof i === "object")
          .map((i) => ({ section: String(i.section || ""), problem: String(i.problem || "") }))
          .filter((i) => i.problem)
      : []
    return { ok: parsed.ok === true || issues.length === 0, issues }
  } catch {
    // If the critic didn't return parseable JSON, don't block — accept draft.
    return { ok: true, issues: [] }
  }
}
