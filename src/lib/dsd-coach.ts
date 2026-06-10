// DSD coach — proposes improvements to the writer & critic agent prompts
// from accumulated analyst feedback across all DSDs. Pure proposal, no
// write: the analyst approves and the apply endpoint commits (propose →
// approve → commit). This is the across-run "training" loop.

import { getLLM } from "./llm"
import { getAgent, type Agent } from "./agents"
import { listSolutions } from "./solutions"
import { listDsd, resolveArtifactFeedback, type DsdFeedback } from "./dsd-store"
import { getLogger } from "./log"

export interface AgentDelta {
  system_prompt?: string
  lessons?: string
}

export interface CoachProposal {
  writer?: AgentDelta
  critic?: AgentDelta
  rationale: string
  feedbackConsidered: number
  /** Ids of the feedback this proposal was built from (to mark resolved). */
  feedbackIds: string[]
}

interface FeedbackEntry extends DsdFeedback {
  solutionId: string
  mode: string
}

async function gatherRecentFeedback(limit: number): Promise<FeedbackEntry[]> {
  const out: FeedbackEntry[] = []
  let solutions
  try {
    solutions = await listSolutions()
  } catch {
    return []
  }
  for (const s of solutions) {
    let arts
    try {
      arts = await listDsd(s.id)
    } catch {
      continue
    }
    for (const a of arts) {
      for (const f of a.feedback || []) {
        if (f.resolved) continue // already incorporated or rejected — skip
        out.push({ ...f, solutionId: s.id, mode: a.mode })
      }
    }
  }
  out.sort((a, b) => (b.at || "").localeCompare(a.at || ""))
  return out.slice(0, limit)
}

/**
 * Mark feedback ids resolved across all artifacts (called after a coach
 * proposal is approved or rejected) so they never drive a new proposal.
 */
export async function resolveFeedback(ids: string[]): Promise<number> {
  const idSet = new Set(ids.filter(Boolean))
  if (idSet.size === 0) return 0
  let solutions
  try {
    solutions = await listSolutions()
  } catch {
    return 0
  }
  let count = 0
  for (const s of solutions) {
    let arts
    try {
      arts = await listDsd(s.id)
    } catch {
      continue
    }
    for (const a of arts) {
      const hasMatch = (a.feedback || []).some((f) => f.id && idSet.has(f.id) && !f.resolved)
      if (!hasMatch) continue
      try {
        if (await resolveArtifactFeedback(s.id, a.id, idSet)) count++
      } catch (err) {
        getLogger().error("Failed to resolve feedback", {
          solutionId: s.id,
          artifactId: a.id,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
  return count
}

export async function proposeCoaching(): Promise<CoachProposal> {
  const [writer, critic, coach] = await Promise.all([
    getAgent("dsd-writer"),
    getAgent("dsd-critic"),
    getAgent("dsd-coach"),
  ])
  const feedback = await gatherRecentFeedback(40)
  if (feedback.length === 0) {
    return {
      rationale: "No new analyst feedback to learn from — rate some DSDs first (already-processed feedback won't reappear).",
      feedbackConsidered: 0,
      feedbackIds: [],
    }
  }
  const llm = await getLLM()
  const raw = await llm.complete({
    prompt: coachPrompt(coach, writer, critic, feedback),
    maxTokens: 2000,
  })
  const proposal = parseProposal(raw)
  proposal.feedbackConsidered = feedback.length
  const ids = feedback.map((f) => f.id).filter((x): x is string => !!x)
  proposal.feedbackIds = ids

  // Consume this training round's feedback now: a round uses up the
  // feedback it considered, whether or not the analyst accepts the
  // specific prompt edits. This guarantees the next round only sees NEW
  // feedback and never re-surfaces an already-considered (or rejected)
  // suggestion.
  const resolved = await resolveFeedback(ids)

  getLogger().info("Coach proposal", {
    feedback: feedback.length,
    resolved,
    writer: !!proposal.writer,
    critic: !!proposal.critic,
  })
  return proposal
}

function coachPrompt(coach: Agent, writer: Agent, critic: Agent, feedback: FeedbackEntry[]): string {
  const digest = feedback
    .map((f, i) => {
      const parts = [`${i + 1}. [${f.rating}]`]
      if (f.comment) parts.push(`comment: ${f.comment}`)
      if (f.correctedText) parts.push(`correction: ${f.correctedText}`)
      return parts.join(" · ")
    })
    .join("\n")

  return `${coach.system_prompt}

CURRENT WRITER PROMPT:
${writer.system_prompt}
WRITER LESSONS:
${writer.lessons || "(none)"}

CURRENT CRITIC PROMPT:
${critic.system_prompt}
CRITIC LESSONS:
${critic.lessons || "(none)"}

RECENT ANALYST FEEDBACK (newest first):
${digest}

Based on recurring problems in the feedback, propose targeted improvements. Prefer adding to "lessons" (concrete rules) over rewriting the system prompt; only suggest a system_prompt change for a fundamental issue. Omit an agent entirely if it needs no change.

Return ONLY JSON, no prose:
{
  "rationale": "1-3 sentences on what the feedback shows and what you changed",
  "writer": { "lessons": "full new lessons text", "system_prompt": "only if changing it" },
  "critic": { "lessons": "...", "system_prompt": "..." }
}`
}

function parseProposal(text: string): CoachProposal {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const body = fenced ? fenced[1] : text
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start < 0 || end < 0) return { rationale: "Coach did not return a usable proposal.", feedbackConsidered: 0, feedbackIds: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = JSON.parse(body.slice(start, end + 1)) as any
    const clean = (d: unknown): AgentDelta | undefined => {
      if (!d || typeof d !== "object") return undefined
      const o = d as Record<string, unknown>
      const out: AgentDelta = {}
      if (typeof o.system_prompt === "string" && o.system_prompt.trim()) out.system_prompt = o.system_prompt.trim()
      if (typeof o.lessons === "string" && o.lessons.trim()) out.lessons = o.lessons.trim()
      return out.system_prompt || out.lessons ? out : undefined
    }
    return {
      rationale: typeof p.rationale === "string" ? p.rationale : "",
      writer: clean(p.writer),
      critic: clean(p.critic),
      feedbackConsidered: 0,
      feedbackIds: [],
    }
  } catch {
    return { rationale: "Coach output could not be parsed.", feedbackConsidered: 0, feedbackIds: [] }
  }
}
