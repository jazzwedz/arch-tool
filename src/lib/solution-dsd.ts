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
import type { Component, Solution } from "./types"
import { getLogger } from "./log"
import { saveDsd, newArtifactId, listDsd, type DsdMode, type DsdSection } from "./dsd-store"
import { getAgent, agentInstruction } from "./agents"
import {
  WRITER_GROUPS,
  CRITIC_LENSES,
  LEAD_AGENT_ID,
  type WriterGroup,
  type CriticLens,
} from "./dsd-sections"

// ----------------------------- job store -----------------------------

export type DsdPhase = "grounding" | "drafting" | "reviewing" | "revising" | "consolidating" | "saving" | "done" | "error"

export interface DsdJob {
  status: "running" | "done" | "error"
  phase: DsdPhase
  /** Set when the run finished and the artifact was persisted. */
  artifactId?: string
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

export function startDsdJob(
  solution: Solution,
  components: Component[],
  mode: DsdMode = "quick"
): string {
  prune()
  const id = randomUUID()
  jobs.set(id, { status: "running", phase: "grounding", updatedAt: Date.now() })
  // Detached — keeps running after the POST response returns.
  runDsd(id, solution, components, mode).catch((e) => {
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

interface DsdResult {
  markdown: string
  iterations: number
  sections?: DsdSection[]
  agentVersions?: Record<string, number>
}

async function runDsd(
  id: string,
  solution: Solution,
  components: Component[],
  mode: DsdMode
): Promise<void> {
  const facts = buildGroundedFacts(solution, components)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const llm: any = await getLLM()

  const result = mode === "team"
    ? await runTeamDsd(id, solution, facts, llm)
    : await runQuickDsd(id, solution, facts, llm)

  // Persist the artifact to the DSD library (best-effort: even if the
  // save fails the markdown is still returned so the user sees it).
  setPhase(id, "saving", { iterations: result.iterations })
  const artifactId = newArtifactId()
  try {
    await saveDsd(
      {
        id: artifactId,
        solutionId: solution.id,
        title: solution.name,
        mode,
        model: llm.model,
        createdAt: new Date().toISOString(),
        ...(result.agentVersions ? { agentVersions: result.agentVersions } : {}),
        // Persist only id+title — the section text already lives in the
        // markdown body; storing bodies here would duplicate the whole doc.
        ...(result.sections ? { sections: result.sections.map((s) => ({ id: s.id, title: s.title })) } : {}),
        iterations: result.iterations,
        feedback: [],
      },
      result.markdown
    )
    jobs.set(id, {
      status: "done",
      phase: "done",
      markdown: result.markdown,
      iterations: result.iterations,
      artifactId,
      updatedAt: Date.now(),
    })
  } catch (e) {
    getLogger().error("Failed to persist DSD artifact", {
      id,
      err: e instanceof Error ? e.message : String(e),
    })
    jobs.set(id, { status: "done", phase: "done", markdown: result.markdown, iterations: result.iterations, updatedAt: Date.now() })
  }
  getLogger().info("DSD job done", { id, mode, iterations: result.iterations })
}

// ----- quick mode: single writer → critic → revise (built-in prompts) -----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runQuickDsd(id: string, solution: Solution, facts: string, llm: any): Promise<DsdResult> {
  setPhase(id, "drafting")
  let draft: string = await llm.complete({ prompt: draftPrompt(solution, facts), maxTokens: 4096 })
  let iterations = 0
  for (let i = 0; i < 2; i++) {
    setPhase(id, "reviewing", { iterations })
    const review = await llm.complete({ prompt: criticPrompt(facts, draft), maxTokens: 1500 })
    const verdict = parseVerdict(review)
    if (verdict.ok || verdict.issues.length === 0) break
    iterations++
    setPhase(id, "revising", { iterations })
    draft = await llm.complete({ prompt: revisePrompt(facts, draft, verdict.issues), maxTokens: 4096 })
  }
  return { markdown: draft, iterations }
}

// ----- team mode: specialised section writers (parallel) → critic panel
// (parallel) → targeted per-section revise → lead consolidation -----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTeamDsd(id: string, solution: Solution, facts: string, llm: any): Promise<DsdResult> {
  const [writers, critics, lead] = await Promise.all([
    Promise.all(WRITER_GROUPS.map((g) => getAgent(g.agentId))),
    Promise.all(CRITIC_LENSES.map((c) => getAgent(c.agentId))),
    getAgent(LEAD_AGENT_ID),
  ])
  const agentVersions: Record<string, number> = {}
  for (const a of [...writers, ...critics, lead]) agentVersions[a.id] = a.version

  const exemplars = await gatherExemplars(solution.id)

  // 1. Draft each section group in parallel.
  setPhase(id, "drafting")
  const sections: DsdSection[] = await Promise.all(
    WRITER_GROUPS.map(async (g, i) => {
      const body: string = await llm.complete({
        prompt: sectionWriterPrompt(g, facts, agentInstruction(writers[i]), exemplars.get(g.agentId)),
        maxTokens: 2200,
      })
      return { id: g.agentId, title: g.name, body: body.trim() }
    })
  )

  // 2. Critic panel reviews the assembled draft (parallel); issues are
  //    tagged with the writer group that owns them.
  setPhase(id, "reviewing")
  const assembled1 = sections.map((s) => s.body || "").join("\n\n")
  const verdicts = await Promise.all(
    CRITIC_LENSES.map((c, i) =>
      llm
        .complete({ prompt: criticLensPrompt(c, facts, assembled1, agentInstruction(critics[i])), maxTokens: 1200 })
        .then((r: string) => parseVerdict(r))
        .catch(() => ({ ok: true, issues: [] as { section: string; problem: string }[] }))
    )
  )
  const issuesByGroup = new Map<string, { section: string; problem: string }[]>()
  for (const v of verdicts) {
    for (const iss of v.issues) {
      const gid = mapIssueToGroup(iss.section)
      if (!gid) continue
      const arr = issuesByGroup.get(gid) || []
      arr.push(iss)
      issuesByGroup.set(gid, arr)
    }
  }

  // 3. Revise only the groups with issues (parallel, one round).
  let iterations = 0
  if (issuesByGroup.size > 0) {
    iterations = 1
    setPhase(id, "revising", { iterations })
    await Promise.all(
      WRITER_GROUPS.map(async (g, i) => {
        const issues = issuesByGroup.get(g.agentId)
        if (!issues || issues.length === 0) return
        const sec = sections.find((s) => s.id === g.agentId)
        if (!sec) return
        const revised: string = await llm.complete({
          prompt: reviseSectionPrompt(g, facts, sec.body || "", issues, agentInstruction(writers[i])),
          maxTokens: 2200,
        })
        sec.body = revised.trim()
      })
    )
  }

  // 4. Deterministic assembly, then a guarded lead consolidation pass.
  setPhase(id, "consolidating", { iterations })
  const assembled = assembleDoc(solution, sections)
  let markdown = assembled
  try {
    const polished: string = (
      await llm.complete({ prompt: leadPrompt(agentInstruction(lead), assembled), maxTokens: 8192 })
    ).trim()
    if (isPolishSafe(polished, assembled)) markdown = polished
  } catch {
    // keep the deterministic assembly
  }

  return { markdown, sections, iterations, agentVersions }
}

// Most recent analyst correction per section group, used as a golden
// few-shot exemplar so writers match the depth/style the analyst wants.
async function gatherExemplars(solutionId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const arts = await listDsd(solutionId) // newest first, includes feedback
    for (const a of arts) {
      for (const f of a.feedback || []) {
        if (f.section && f.correctedText && !map.has(f.section)) map.set(f.section, f.correctedText)
      }
    }
  } catch {
    // no exemplars — fine
  }
  return map
}

const ALL_CHAPTER_TITLES = WRITER_GROUPS.flatMap((g) => g.chapters.map((c) => c.title))

// Resolve a critic's issue tag to a writer group id (it may return the
// group id directly, or a chapter title).
function mapIssueToGroup(section: string | undefined): string | undefined {
  if (!section) return undefined
  const s = section.trim().toLowerCase()
  const byId = WRITER_GROUPS.find((g) => g.agentId.toLowerCase() === s)
  if (byId) return byId.agentId
  const byChapter = WRITER_GROUPS.find((g) =>
    g.chapters.some((c) => s.includes(c.title.toLowerCase()) || c.title.toLowerCase().includes(s))
  )
  return byChapter?.agentId
}

function assembleDoc(solution: Solution, sections: DsdSection[]): string {
  const toc = ["1. Version History", ...ALL_CHAPTER_TITLES].map((t) => `- ${t}`).join("\n")
  const ordered = WRITER_GROUPS.map((g) => sections.find((s) => s.id === g.agentId)?.body || "").filter(Boolean)
  return [
    `# ${solution.name} — Detailed Solution Description`,
    ``,
    `## Table of Contents`,
    toc,
    ``,
    `## 1. Version History`,
    `| Version | Date | Author | Changes |`,
    `|---------|------|--------|---------|`,
    `| 1.0 | ${new Date().toISOString().slice(0, 10)} | Auto-generated (agent team) | Initial version |`,
    ``,
    ordered.join("\n\n"),
  ].join("\n")
}

// Guard against a lead pass that truncated or dropped content: keep the
// polish only if it is long enough and still contains every chapter.
function isPolishSafe(polished: string, assembled: string): boolean {
  if (polished.length < assembled.length * 0.8) return false
  return ALL_CHAPTER_TITLES.every((t) => polished.includes(t))
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

  // Capability mapping + gaps
  const caps = solution.delivers?.capabilities || []
  if (caps.length) {
    lines.push(`## Capability mapping`)
    const findCovering = (name: string) => {
      const hits: string[] = []
      for (const m of members) {
        const c = byId.get(m.component)
        if (!c) {
          // new component not in catalog snapshot — count it as a provider
          if (m.disposition === "new") hits.push(`${m.component} (new)`)
          continue
        }
        if ((c.capabilities || []).some((x) => x.name?.toLowerCase() === name.toLowerCase()))
          hits.push(`${c.name}${m.disposition === "new" ? " (new)" : ""}`)
        else if (m.disposition === "new") hits.push(`${c.name} (new)`)
      }
      return hits
    }
    for (const cap of caps) {
      const hits = findCovering(cap)
      lines.push(`- Capability "${cap}" → ${hits.length ? hits.join(", ") : "GAP — no member provides it (needs a new component)"}`)
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

  // Process sequences — ordered, actor→target steps.
  const processes = solution.processes || []
  if (processes.length) {
    lines.push(`## Process sequences`)
    for (const p of processes) {
      const actorLabel = (id: string) => {
        const a = p.actors.find((x) => x.id === id)
        if (!a) return id
        return a.label || (a.component ? label(a.component) : a.id)
      }
      lines.push(`### ${p.name}`)
      if (p.goal) lines.push(`- Goal: ${p.goal}`)
      if (p.actors.length) {
        const parts = p.actors
          .map((a) => `${a.label}${a.role ? ` (${a.role})` : ""}`)
          .join(", ")
        lines.push(`- Participants: ${parts}`)
      }
      p.steps.forEach((s, i) => {
        const kind = s.kind || "sync"
        if (!s.to || kind === "note") {
          lines.push(`${i + 1}. [${actorLabel(s.from)}] ${s.label}${s.description ? ` — ${s.description}` : ""}`)
        } else {
          lines.push(
            `${i + 1}. ${actorLabel(s.from)} → ${actorLabel(s.to)} (${kind}): ${s.label}${s.description ? ` — ${s.description}` : ""}`
          )
        }
      })
      lines.push("")
    }
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

function draftPrompt(solution: Solution, facts: string, instruction?: string): string {
  const lead =
    instruction ||
    `You are a solution architect writing a Detailed Solution Description (DSD) in Markdown. ${STYLE}`
  return `${lead}

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

function criticPrompt(facts: string, draft: string, instruction?: string): string {
  const lead =
    instruction ||
    `You are reviewing a Detailed Solution Description draft against the verified facts it must be based on. Find ONLY real problems.`
  return `${lead}

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

function revisePrompt(
  facts: string,
  draft: string,
  issues: { section: string; problem: string }[],
  instruction?: string
): string {
  const issueList = issues.map((i, n) => `${n + 1}. [${i.section}] ${i.problem}`).join("\n")
  const lead = instruction ? `${instruction}\n\n` : ""
  return `${lead}Revise the Detailed Solution Description below to fix the listed issues. Keep everything that is correct; change only what the issues require. Stay strictly within the verified facts. ${STYLE}

VERIFIED FACTS:
${facts}

ISSUES TO FIX:
${issueList}

CURRENT DRAFT:
${draft}

Output only the full corrected Markdown document.`
}

// ----- team-mode prompts -----

function sectionWriterPrompt(group: WriterGroup, facts: string, instruction: string, exemplar?: string): string {
  const chapters = group.chapters.map((c) => `## ${c.title}\n${c.guidance}`).join("\n\n")
  const ex = exemplar
    ? `\nAn analyst-approved example of the depth and style they want for this part — match it, but use THIS solution's facts (do not copy its content):\n"""\n${exemplar}\n"""\n`
    : ""
  return `${instruction}

Write ONLY your assigned chapters of a Detailed Solution Description, grounded STRICTLY in the verified facts. Output each chapter with its exact "## N. Title" heading, in order, and nothing else — no document title, no other chapters.

YOUR CHAPTERS:
${chapters}
${ex}
VERIFIED FACTS:
${facts}

Output only the Markdown for your chapters.`
}

function criticLensPrompt(lens: CriticLens, facts: string, draft: string, instruction: string): string {
  const groups = WRITER_GROUPS.map((g) => `- ${g.agentId}: ${g.chapters.map((c) => c.title).join("; ")}`).join("\n")
  return `${instruction}

Review the DSD draft below through your lens only. For each real problem, return an issue tagged with the writer GROUP id that owns the affected chapter.

WRITER GROUPS (use the id as "section"):
${groups}

VERIFIED FACTS:
${facts}

DRAFT:
${draft}

Return ONLY JSON, no prose:
{ "ok": boolean, "issues": [ { "section": "<group id>", "problem": "what is wrong and how to fix" } ] }
"ok" is true when there are no problems in your lens.`
}

function reviseSectionPrompt(
  group: WriterGroup,
  facts: string,
  body: string,
  issues: { section: string; problem: string }[],
  instruction: string
): string {
  const issueList = issues.map((i, n) => `${n + 1}. ${i.problem}`).join("\n")
  const chapters = group.chapters.map((c) => c.title).join(", ")
  return `${instruction}

Revise your chapters (${chapters}) to fix the listed issues. Keep everything correct; change only what the issues require. Stay strictly within the verified facts. Output each chapter with its exact "## N. Title" heading and nothing else. ${STYLE}

ISSUES TO FIX:
${issueList}

VERIFIED FACTS:
${facts}

YOUR CURRENT CHAPTERS:
${body}

Output only the corrected Markdown for your chapters.`
}

function leadPrompt(instruction: string, assembled: string): string {
  return `${instruction}

Polish the assembled DSD below into one coherent document: improve flow, transitions and terminology consistency, and remove duplication ACROSS sections. Do NOT add or remove facts, chapters or the architecture diagram, and keep every chapter with its exact "## N. Title" heading. Return the FULL document.

DOCUMENT:
${assembled}

Output only the full polished Markdown document.`
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
