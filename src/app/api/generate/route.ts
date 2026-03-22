import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { checkRateLimit } from "@/lib/rate-limit"
import { isValidAudience, sanitizeForPrompt } from "@/lib/validate"

const anthropic = new Anthropic()

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute before trying again." },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { audience } = body

    if (!isValidAudience(audience)) {
      return NextResponse.json(
        { error: "Invalid audience. Must be Technical, Business, or Executive." },
        { status: 400 }
      )
    }

    let prompt: string

    if (body.componentId) {
      prompt = buildComponentPrompt(sanitizeForPrompt(body.yamlContent), audience)
    } else if (body.diagramName) {
      prompt = buildDiagramPrompt(
        sanitizeForPrompt(body.diagramName),
        sanitizeForPrompt(body.componentsYaml),
        audience
      )
    } else {
      return NextResponse.json(
        { error: "No component or diagram selected" },
        { status: 400 }
      )
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const textBlock = message.content.find((block) => block.type === "text")
    const generatedText = textBlock ? textBlock.text : ""

    return NextResponse.json({ generated: generatedText })
  } catch (error) {
    console.error("Failed to generate doc:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to generate documentation" },
      { status: 500 }
    )
  }
}

function buildComponentPrompt(yamlContent: string, audience: string): string {
  return `You are a documentation writer producing clear, professional architecture documents. Your writing must sound human and natural — never like AI-generated content.

${writingStyleRules()}

Audience: ${audience}
${audienceGuidance(audience)}

Component definition (YAML):
\`\`\`yaml
${yamlContent}
\`\`\`

Generate a well-structured document in Markdown format with these chapters in this exact order:

# [Component Name]

## Table of Contents
(list all chapters below as a numbered list)

## 1. Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [today's date] | Auto-generated | Initial version |

## 2. Document Purpose
Explain why this document exists and who should read it.

## 3. What This Component Does
Focus on what it does for the business — what problems it solves, what it enables. Not what it "is" technically.

## 4. Key Capabilities
What can people do with it? What does it make possible?

## 5. How It Connects to Other Systems
Describe the connections in plain language — what goes in, what comes out, who depends on it.

## 6. Current State
Status, who is responsible, any known risks.

Focus on accurately describing what is defined in the data. Do not invent information that is not present.`
}

function buildDiagramPrompt(
  diagramName: string,
  componentsYaml: string,
  audience: string
): string {
  return `You are a documentation writer producing clear, professional architecture documents. Your writing must sound human and natural — never like AI-generated content.

${writingStyleRules()}

Diagram: ${diagramName}
Audience: ${audience}
${audienceGuidance(audience)}

The diagram contains the following components from the architecture catalog:

\`\`\`yaml
${componentsYaml}
\`\`\`

Generate a well-structured document in Markdown format with these chapters in this exact order:

# ${diagramName} — System Overview

## Table of Contents
(list all chapters below as a numbered list)

## 1. Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [today's date] | Auto-generated | Initial version |

## 2. Document Purpose
Explain why this document exists and who should read it.

## 3. What This System Does
Describe the overall purpose — what business problems this system solves, what it enables. Focus on outcomes, not on the technology itself.

## 4. How It Works (High Level)
Walk through the main flow — what happens when the system is used. Describe it as a story: data comes in here, gets processed there, results go here. Keep it accessible.

## 5. Building Blocks
Describe each component in the system — not technically, but by what role it plays and what it does.

## 6. How the Parts Connect
Describe how data and requests flow between the building blocks. What talks to what, and why.

## 7. Current State
Overall maturity, ownership, any known risks or limitations.

Focus on accurately describing what is defined in the data. Use the interfaces, dependencies, types, and descriptions to explain the system. Do not invent information that is not present.`
}

function writingStyleRules(): string {
  return `CRITICAL WRITING RULES:
- Write like a knowledgeable colleague explaining things over coffee — clear, direct, no fluff.
- NEVER use words like: leverage, utilize, robust, seamless, cutting-edge, comprehensive, streamline, facilitate, holistic, synergy, ecosystem, paradigm, empower, innovative, scalable, optimize, orchestrate, harness, drive (as in "drives value"), enable (overused), ensure (overused), foster.
- NEVER start sentences with "This component..." or "This system..." repeatedly. Vary your sentence structure.
- Use short sentences. If a sentence has more than 20 words, split it.
- Do not use marketing language or hype. State facts plainly.
- Prefer everyday words: "uses" not "utilizes", "connects to" not "interfaces with", "handles" not "facilitates", "runs" not "orchestrates".
- Do not pad with filler phrases like "It is worth noting that" or "It is important to understand that". Just say the thing.
- No bullet points that just restate the heading in different words.`
}

function audienceGuidance(audience: string): string {
  switch (audience) {
    case "Technical":
      return "Write for software engineers and architects. You may use technical terms, mention protocols and patterns. But still keep it readable — no walls of jargon."
    case "Business":
      return "Write for business stakeholders and product managers. Explain what things do and why they matter — not how they work internally. Zero IT jargon. If you must reference a technical concept, explain it in one plain sentence."
    case "Executive":
      return "Write for C-level executives. Be brief and direct. Focus on what this does for the business, what risks exist, and what the current state is. Maximum clarity, minimum words. No technical terms at all."
    default:
      return ""
  }
}
