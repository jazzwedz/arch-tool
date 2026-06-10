// DSD coach — proposes improvements to the writer & critic agent prompts
// from accumulated analyst feedback across all DSDs. Pure proposal, no
// write: the analyst approves and the apply endpoint commits (propose →
// approve → commit). This is the across-run "training" loop.

import { getLLM } from "./llm"
import { getAgent, getCoachWatermark, setCoachWatermark, type Agent } from "./agents"
import { listSolutions } from "./solutions"
import { listDsd, type DsdFeedback } from "./dsd-store"
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

// Gather feedback newer than the coach watermark (already-trained-on
// feedback is at or before it and is excluded).
async function gatherRecentFeedback(limit: number, since: string): Promise<FeedbackEntry[]> {
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
        if (!f.at) continue
        if (since && f.at <= since) continue // already considered in a prior round
        out.push({ ...f, solutionId: s.id, mode: a.mode })
      }
    }
  }
  out.sort((a, b) => (b.at || "").localeCompare(a.at || ""))
  return out.slice(0, limit)
}

export async function proposeCoaching(): Promise<CoachProposal> {
  const [writer, critic, coach] = await Promise.all([
    getAgent("dsd-writer"),
    getAgent("dsd-critic"),
    getAgent("dsd-coach"),
  ])
  const since = await getCoachWatermark()
  const feedback = await gatherRecentFeedback(40, since)
  if (feedback.length === 0) {
    return {
      rationale: "No new analyst feedback since the last training round — rate some DSDs first.",
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
  proposal.feedbackIds = feedback.map((f) => f.id).filter((x): x is string => !!x)

  // Advance the watermark past everything this round considered, so the
  // next round only sees strictly newer feedback — whether or not the
  // analyst accepts the prompt edits. (A declined suggestion is built
  // from now-consumed feedback, so it can't reappear.)
  const newest = feedback.reduce((mx, f) => (f.at && f.at > mx ? f.at : mx), since)
  try {
    await setCoachWatermark(newest)
  } catch (e) {
    getLogger().error("Failed to advance coach watermark", {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  getLogger().info("Coach proposal", {
    feedback: feedback.length,
    since,
    newWatermark: newest,
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
