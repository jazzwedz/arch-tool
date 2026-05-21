// Pass 1 — relevance filter.
//
// Given a component's metadata and the full document text, ask the LLM
// to surface the passages that look like rules / calculations / formulas
// / constraints belonging to THIS component. The output feeds Pass 2,
// which extracts structured rule candidates from a much smaller window.
//
// Small documents (under SKIP_PASS_1_CHARS) bypass this pass entirely —
// for a 5-page spec the filter step costs more than it saves.

import type { Component } from "@/lib/types"
import { getLLM } from "@/lib/llm"
import type { RelevantSection } from "./types"

export const SKIP_PASS_1_CHARS = 20_000

// Cap the input we send for Pass 1; truncate from the end (back of the
// document) rather than the front so headings near the top survive.
const PASS_1_INPUT_CAP = 240_000
const PASS_1_MAX_TOKENS = 2500

function buildComponentContext(c: Component): string {
  const caps =
    c.capabilities?.map((cp) => cp.name).filter(Boolean).slice(0, 12).join(", ") || "(none)"
  const interfaces =
    c.interfaces
      ?.map((i) => `${i.direction} ${i.type}: ${i.target}`)
      .slice(0, 12)
      .join("; ") || "(none)"
  const dataIn =
    c.data?.inputs
      ?.map((d) => d.name)
      .filter(Boolean)
      .slice(0, 8)
      .join(", ") || "(none)"
  const dataOut =
    c.data?.outputs
      ?.map((d) => d.name)
      .filter(Boolean)
      .slice(0, 8)
      .join(", ") || "(none)"
  return [
    `Component id: ${c.id}`,
    `Component name: ${c.name}`,
    `Type: ${c.type}`,
    `Owner: ${c.owner || "(unassigned)"}`,
    `One-liner: ${c.description?.oneliner || "(none)"}`,
    `Technical: ${(c.description?.technical || "").slice(0, 600) || "(none)"}`,
    `Business: ${(c.description?.business || "").slice(0, 600) || "(none)"}`,
    `Capabilities: ${caps}`,
    `Interfaces: ${interfaces}`,
    `Data in: ${dataIn}`,
    `Data out: ${dataOut}`,
  ].join("\n")
}

function buildPrompt(component: Component, docName: string, docText: string): string {
  const safeText = docText.length > PASS_1_INPUT_CAP
    ? docText.slice(0, PASS_1_INPUT_CAP) + "\n\n…(document truncated to fit context window)"
    : docText
  return `You are an architecture analyst. A team maintains a software component:

${buildComponentContext(component)}

Below is a document ("${docName}") from the team's knowledge base. Find every passage that contains BUSINESS RULES, CALCULATIONS, FORMULAS, or CONSTRAINTS that apply to THIS COMPONENT specifically.

A passage is relevant when it describes:
- a calculation this component performs (formula)
- a conditional rule this component enforces (given / when / then)
- a constraint or invariant this component must respect
- a decision this component makes

Be selective. Ignore:
- rules that clearly apply to a different component
- general background, history, glossaries
- diagrams without rule content
- legal boilerplate
- table-of-contents entries

Return ONLY a single JSON object with this exact shape, no surrounding prose:
{
  "sections": [
    {
      "title": "<short identifier, e.g. heading or first line>",
      "excerpt": "<the actual passage verbatim, max 1500 chars>",
      "why_relevant": "<one short sentence about which part of the component this affects>",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

If nothing in the document is relevant, return {"sections": []}.

DOCUMENT TEXT:
"""
${safeText}
"""`
}

function extractJson(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : raw
  const first = candidate.indexOf("{")
  const last = candidate.lastIndexOf("}")
  if (first === -1 || last === -1 || last < first) return null
  try {
    return JSON.parse(candidate.slice(first, last + 1))
  } catch {
    return null
  }
}

export interface IdentifyResult {
  sections: RelevantSection[]
  ms: number
}

export async function identifyRelevantSections(
  component: Component,
  docName: string,
  docText: string
): Promise<IdentifyResult> {
  const t0 = Date.now()
  const llm = await getLLM()
  const prompt = buildPrompt(component, docName, docText)
  const raw = await llm.complete({ prompt, maxTokens: PASS_1_MAX_TOKENS })
  const parsed = extractJson(raw)
  const sections: RelevantSection[] = []
  if (parsed && typeof parsed === "object" && "sections" in parsed) {
    const arr = (parsed as { sections?: unknown[] }).sections
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (!item || typeof item !== "object") continue
        const it = item as {
          title?: unknown
          excerpt?: unknown
          why_relevant?: unknown
          confidence?: unknown
        }
        if (typeof it.title !== "string" || typeof it.excerpt !== "string") continue
        const conf =
          it.confidence === "high" || it.confidence === "medium" || it.confidence === "low"
            ? it.confidence
            : "medium"
        sections.push({
          title: it.title.slice(0, 200),
          excerpt: it.excerpt.slice(0, 1800),
          whyRelevant: typeof it.why_relevant === "string" ? it.why_relevant.slice(0, 240) : "",
          confidence: conf,
        })
      }
    }
  }
  return { sections, ms: Date.now() - t0 }
}

// Synthesise a Pass 1-shaped result without calling the LLM. Used when
// the document is small enough that the filter pass would be wasteful —
// we treat the whole text as one relevant passage and let Pass 2 do the
// extraction directly.
export function wholeDocAsSingleSection(
  docName: string,
  docText: string
): RelevantSection[] {
  return [
    {
      title: docName,
      excerpt: docText,
      whyRelevant: "Document small enough to extract from in full (Pass 1 skipped).",
      confidence: "high",
    },
  ]
}
