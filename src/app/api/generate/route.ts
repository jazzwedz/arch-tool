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
  return `You are an enterprise architecture documentation expert. Generate a detailed, accurate architecture description for the following IT component based on all the data provided.

Audience: ${audience}
${audienceGuidance(audience)}

Component definition (YAML):
\`\`\`yaml
${yamlContent}
\`\`\`

Generate a well-structured document in Markdown format. Include:
1. Component Overview — what it is and what it does
2. Purpose and Responsibilities
3. Technical Details — interfaces it provides/consumes, dependencies, protocols
4. Integration Points — how it connects to other systems
5. Current Status and Ownership

Focus on accurately describing what is defined in the data. Do not invent information that is not present. Adapt the language and depth to the specified audience.`
}

function buildDiagramPrompt(
  diagramName: string,
  componentsYaml: string,
  audience: string
): string {
  return `You are an enterprise architecture documentation expert. Generate a detailed, accurate architecture description for a system represented by the following diagram.

Diagram: ${diagramName}
Audience: ${audience}
${audienceGuidance(audience)}

The diagram contains the following components from the architecture catalog. Here is the full definition of each component:

\`\`\`yaml
${componentsYaml}
\`\`\`

Generate a well-structured document in Markdown format. Include:
1. System Overview — what this diagram represents as a whole, based on the components present
2. Component Descriptions — the role and responsibility of each component in the system
3. Integration and Data Flow — how the components connect and communicate, based on their interfaces and dependencies
4. Architecture Patterns — patterns observed (e.g., event-driven, microservices, gateway pattern)
5. System Status — overall maturity based on component statuses

Focus on accurately describing what is defined in the data. Use the interfaces, dependencies, types, and descriptions to explain the architecture. Do not invent information that is not present. Adapt the language and depth to the specified audience.`
}

function audienceGuidance(audience: string): string {
  switch (audience) {
    case "Technical":
      return "Write for software engineers and architects. Use technical terminology, mention protocols, patterns, and implementation details."
    case "Business":
      return "Write for business stakeholders and product managers. Focus on business value, capabilities, and impact. Avoid deep technical jargon."
    case "Executive":
      return "Write for C-level executives. Be concise and high-level. Focus on strategic value, risk, and ROI. Use simple language, no technical details."
    default:
      return ""
  }
}
