// Agent definitions for the DSD agent-team (writer / critic / coach).
//
// Agents are configuration, not code (mirrors xplainit-agents' data-driven
// model): stored as agents/<id>.yaml in the data repo so the coach can
// "train" them by committing improved prompts — versioned + auditable in
// git. When a file is absent the built-in default is used, so the feature
// works before anyone has committed an agent file.

import yaml from "js-yaml"
import { getGit } from "./git"
import { getLogger } from "./log"

export type AgentRole = "writer" | "critic" | "coach"

export interface Agent {
  id: string
  name: string
  role: AgentRole
  /** Empty = use the gateway's default model. */
  model?: string
  temperature?: number
  version: number
  system_prompt: string
  /** Coach-appended rules learned from feedback. */
  lessons?: string
}

export const AGENT_IDS = ["dsd-writer", "dsd-critic", "dsd-coach"] as const
export type AgentId = (typeof AGENT_IDS)[number]

const DEFAULTS: Record<AgentId, Agent> = {
  "dsd-writer": {
    id: "dsd-writer",
    name: "DSD Writer",
    role: "writer",
    temperature: 0.4,
    version: 1,
    system_prompt: `You are a solution architect writing a Detailed Solution Description (DSD) in Markdown. Write like a knowledgeable colleague — clear, direct, no fluff. Short sentences. No marketing words (leverage, robust, seamless, synergy, holistic, empower, streamline). State facts plainly. Stay strictly within the verified facts you are given; do not invent components, flows, capabilities or values.`,
  },
  "dsd-critic": {
    id: "dsd-critic",
    name: "DSD Critic",
    role: "critic",
    temperature: 0.2,
    version: 1,
    system_prompt: `You are a strict reviewer of Detailed Solution Description drafts. You check a draft against the verified facts it must be based on and find ONLY real problems: invented components/flows/values, contradictions with the facts, missing required chapters, or claims (NFR / risks / rules) the facts do not support. Be strict about inventions and omissions, lenient about style.`,
  },
  "dsd-coach": {
    id: "dsd-coach",
    name: "DSD Coach",
    role: "coach",
    temperature: 0.3,
    version: 1,
    system_prompt: `You are a coach who improves two agents — a DSD Writer and a DSD Critic — by refining their instructions. You are given their current prompts plus recent generated DSDs together with the critic's findings and the analysts' feedback (ratings, comments, corrections). Identify recurring problems and propose concrete, minimal improvements to the writer's and critic's system prompts and "lessons" so the next documents are better. Do not rewrite prompts wholesale; suggest targeted additions/edits grounded in the evidence.`,
  },
}

function pathFor(id: string): string {
  return `agents/${id}.yaml`
}

export async function getAgent(id: AgentId): Promise<Agent> {
  const git = getGit()
  try {
    const file = await git.getFile(pathFor(id))
    const parsed = yaml.load(file.content, { schema: yaml.JSON_SCHEMA }) as Partial<Agent>
    if (parsed && typeof parsed.system_prompt === "string") {
      return { ...DEFAULTS[id], ...parsed, id, role: DEFAULTS[id].role } as Agent
    }
  } catch {
    // not committed yet — fall back to the built-in default
  }
  return DEFAULTS[id]
}

export interface AgentWithSha extends Agent {
  sha?: string
}

export async function getAgentWithSha(id: AgentId): Promise<AgentWithSha> {
  const git = getGit()
  try {
    const file = await git.getFile(pathFor(id))
    const parsed = yaml.load(file.content, { schema: yaml.JSON_SCHEMA }) as Partial<Agent>
    if (parsed && typeof parsed.system_prompt === "string") {
      return { ...DEFAULTS[id], ...parsed, id, role: DEFAULTS[id].role, sha: file.sha }
    }
  } catch {
    // fall through
  }
  return { ...DEFAULTS[id] }
}

export async function listAgents(): Promise<Agent[]> {
  return Promise.all(AGENT_IDS.map((id) => getAgent(id)))
}

export async function saveAgent(agent: Agent, sha?: string): Promise<void> {
  const git = getGit()
  const body: Agent = { ...agent, version: (agent.version || 0) + 1 }
  const content = yaml.dump(body, { lineWidth: -1, noRefs: true, sortKeys: false })
  await git.putFile(pathFor(agent.id), content, `chore(agents): update ${agent.id} (v${body.version})`, sha)
  getLogger().info("Agent updated", { id: agent.id, version: body.version })
}

/** Compose the per-call instruction block: system prompt + learned lessons. */
export function agentInstruction(a: Agent): string {
  const lessons = a.lessons?.trim()
  return lessons ? `${a.system_prompt}\n\nLessons learned (apply these):\n${lessons}` : a.system_prompt
}

// ----- coach watermark -----
// A single timestamp: feedback at or before it has already been used by a
// training round, so the coach only ever considers strictly newer
// feedback. Robust (no per-feedback bookkeeping) and immune to legacy
// feedback that predates the id field.

const COACH_STATE_PATH = "agents/_coach-state.yaml"

export async function getCoachWatermark(): Promise<string> {
  try {
    const file = await getGit().getFile(COACH_STATE_PATH)
    const o = yaml.load(file.content, { schema: yaml.JSON_SCHEMA }) as { lastTrainedAt?: string } | null
    return typeof o?.lastTrainedAt === "string" ? o.lastTrainedAt : ""
  } catch {
    return ""
  }
}

export async function setCoachWatermark(at: string): Promise<void> {
  const git = getGit()
  let sha: string | undefined
  try {
    sha = (await git.getFile(COACH_STATE_PATH)).sha
  } catch {
    // file doesn't exist yet
  }
  await git.putFile(
    COACH_STATE_PATH,
    yaml.dump({ lastTrainedAt: at }, { lineWidth: -1 }),
    "chore(agents): advance coach training watermark",
    sha
  )
}
