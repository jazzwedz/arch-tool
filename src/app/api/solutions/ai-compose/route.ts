// POST /api/solutions/ai-compose
//
// AI-assisted solution skeleton. Given the analyst's intent (name + goal
// + description), the LLM reads the whole catalog (the same LLM-friendly
// markdown export used elsewhere) and proposes the rest of the solution:
// delivered capabilities/processes, member components (chosen from real
// catalog ids), gap "new" components, and flows between members.
//
// Reuses the existing LLM client (getLLM) and the catalog export
// (buildCatalogMarkdown). Returns a structured proposal the composer
// wizard pre-fills its steps with — the analyst then edits and creates.

import { NextResponse } from "next/server"
import { listComponents } from "@/lib/github"
import { buildCatalogMarkdown } from "@/lib/catalog-export"
import { getLLM, isLLMConfigured, LLM_DISABLED_MESSAGE } from "@/lib/llm"
import { checkRateLimit } from "@/lib/rate-limit"
import { sanitizeForPrompt } from "@/lib/validate"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"
import { LINK_ROLES, LINK_PROTOCOLS, MEMBER_DISPOSITIONS } from "@/lib/constants"
import type { LinkRole, LinkProtocol, MemberDisposition } from "@/lib/types"

export const dynamic = "force-dynamic"

interface Body {
  name?: string
  goal?: string
  description?: string
}

interface AiMember {
  component: string
  disposition: MemberDisposition
  role?: string
}
interface AiNewComponent {
  name: string
  type: string
  role?: string
}
interface AiFlow {
  from: string
  to: string
  role: LinkRole
  protocol?: LinkProtocol
  status: "existing" | "proposed"
}

export async function POST(request: Request) {
  return withRouteContext(request, async () => {
    if (!isLLMConfigured()) {
      return NextResponse.json({ error: LLM_DISABLED_MESSAGE }, { status: 503 })
    }
    const clientIp = request.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute before trying again." },
        { status: 429 }
      )
    }

    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 })
    }
    if (!body.description || body.description.trim() === "") {
      return NextResponse.json(
        { error: "A description is required for AI assist." },
        { status: 400 }
      )
    }

    try {
      const components = await listComponents()
      const catalog = buildCatalogMarkdown(components, {
        generatedAt: new Date().toISOString(),
      })
      const ids = new Set(components.map((c) => c.id))

      const llm = await getLLM()
      const prompt = buildPrompt(
        sanitizeForPrompt(body.name || ""),
        sanitizeForPrompt(body.goal || ""),
        sanitizeForPrompt(body.description),
        catalog
      )
      const raw = await llm.complete({ prompt, maxTokens: 4096 })
      const parsed = parseJsonObject(raw)

      // Validate / coerce against the catalog and enums. Members and
      // flow endpoints must reference real component ids (the model is
      // told this, but we enforce it); new components are free-form.
      const newComponents: AiNewComponent[] = Array.isArray(parsed.newComponents)
        ? parsed.newComponents
            .filter((n: unknown) => n && typeof n === "object")
            .map((n: Record<string, unknown>) => ({
              name: String(n.name || "").trim(),
              type: typeof n.type === "string" ? n.type : "service",
              role: typeof n.role === "string" ? n.role : undefined,
            }))
            .filter((n: AiNewComponent) => n.name !== "")
        : []

      const members: AiMember[] = Array.isArray(parsed.members)
        ? parsed.members
            .filter((m: unknown) => m && typeof m === "object")
            .map((m: Record<string, unknown>) => ({
              component: String(m.component || "").trim(),
              disposition: MEMBER_DISPOSITIONS.includes(m.disposition as MemberDisposition)
                ? (m.disposition as MemberDisposition)
                : "reuse",
              role: typeof m.role === "string" ? m.role : undefined,
            }))
            .filter((m: AiMember) => ids.has(m.component))
        : []

      const flows: AiFlow[] = Array.isArray(parsed.flows)
        ? parsed.flows
            .filter((f: unknown) => f && typeof f === "object")
            .map((f: Record<string, unknown>) => ({
              from: String(f.from || "").trim(),
              to: String(f.to || "").trim(),
              role: LINK_ROLES.includes(f.role as LinkRole) ? (f.role as LinkRole) : "calls",
              protocol: LINK_PROTOCOLS.includes(f.protocol as LinkProtocol)
                ? (f.protocol as LinkProtocol)
                : undefined,
              status: (f.status === "existing" ? "existing" : "proposed") as "existing" | "proposed",
            }))
            .filter((f: AiFlow) => f.from && f.to && f.from !== f.to)
        : []

      const delivers = {
        capabilities: toStringArray(parsed?.delivers?.capabilities),
        processes: toStringArray(parsed?.delivers?.processes),
      }

      getLogger().info("AI solution compose", {
        members: members.length,
        newComponents: newComponents.length,
        flows: flows.length,
      })

      return NextResponse.json({ delivers, members, newComponents, flows })
    } catch (error) {
      getLogger().error("AI solution compose failed", {
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        { error: `AI compose failed: ${error instanceof Error ? error.message : "Unknown error"}` },
        { status: 500 }
      )
    }
  })
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : []
}

// Extract the first JSON object from the model output (tolerates code
// fences and surrounding prose).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonObject(text: string): Record<string, any> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Model did not return JSON")
  }
  return JSON.parse(body.slice(start, end + 1))
}

function buildPrompt(name: string, goal: string, description: string, catalog: string): string {
  return `You are a solution architect. An analyst is composing a new solution by reusing components from an existing catalog. From their intent and the catalog below, propose the solution skeleton.

Analyst intent:
- Name: ${name || "(none)"}
- Goal: ${goal || "(none)"}
- Description:
${description}

The component catalog (reuse these — pick members by their exact id):
${catalog}

Return ONLY a JSON object, no prose, no code fence, with this exact shape:
{
  "delivers": { "capabilities": ["..."], "processes": ["..."] },
  "members": [ { "component": "<existing component id>", "disposition": "reuse|extend|external", "role": "what it does in this solution" } ],
  "newComponents": [ { "name": "Human Name", "type": "service|microservice|component|frontend|gateway|database|queue|library", "role": "what it does" } ],
  "flows": [ { "from": "<member id or new component name>", "to": "<member id or new component name>", "role": "calls|serves|reads-from|writes-to|part-of|contains", "protocol": "rest|grpc|async|db|table|file|human|info|link|data", "status": "existing|proposed" } ]
}

Rules:
- members[].component MUST be an exact id from the catalog. Do not invent ids.
- Put anything that does not exist yet in newComponents (not members).
- Prefer reuse; mark a component "extend" only if it needs changes.
- delivers should be the business capabilities/processes this solution provides.
- flows describe how the parts interact; use "proposed" for to-be edges.
- Keep it focused: only what the description implies. Output valid JSON only.`
}
