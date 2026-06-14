// Canonical DSD structure for the agent-team pipeline.
//
// The document is split into a few coherent SECTION GROUPS, each written by
// its own specialised, trainable writer agent (section === agent, so
// per-section analyst feedback trains exactly the right agent). A panel of
// critic lenses reviews the assembled draft; a lead agent consolidates.
//
// Quick mode does NOT use this — it stays a single writer/critic/revise
// pass with the built-in prompts.

export interface DsdChapter {
  /** `## <number>. <title>` heading used in the final document. */
  title: string
  /** What this chapter must contain (grounded in the verified facts). */
  guidance: string
}

export interface WriterGroup {
  agentId: string
  name: string
  /** One-line focus shown in the team UI and used in the prompt lead. */
  focus: string
  chapters: DsdChapter[]
}

export interface CriticLens {
  agentId: string
  name: string
  /** What this critic looks for (beyond the others). */
  focus: string
}

export const LEAD_AGENT_ID = "dsd-lead"
export const COACH_AGENT_ID = "dsd-coach"

// Ordered writer groups. The numbers below set chapter order in the final
// document (Version History is added deterministically as chapter 1).
export const WRITER_GROUPS: WriterGroup[] = [
  {
    agentId: "dsd-writer-business",
    name: "Business writer",
    focus: "business value and scope, in plain outcome language",
    chapters: [
      { title: "2. Executive Summary", guidance: "What the solution does and the business goal, in two short paragraphs. Lead with the outcome." },
      { title: "3. Business Context", guidance: "The capabilities it delivers and why they matter to the business. Tie each to a concrete outcome." },
      { title: "4. Scope", guidance: "In scope: the member components and what they cover. State plainly that anything not listed is out of scope." },
    ],
  },
  {
    agentId: "dsd-writer-architecture",
    name: "Architecture writer",
    focus: "precise technical structure and behaviour, strictly from the facts",
    chapters: [
      { title: "5. Solution Architecture", guidance: "The component inventory table (verbatim from the facts) and 2-3 sentences on how the pieces fit. Then include the architecture mermaid block from the facts verbatim." },
      { title: "6. Capability Mapping", guidance: "The capability mapping from the facts. Call out any GAP that needs a new component." },
      { title: "7. Process Sequences", guidance: "For each process sequence in the facts: its participants (with roles) and the ordered steps. If there are none, say 'No process sequences modelled yet.'" },
      { title: "8. Dependencies", guidance: "The external dependencies from the facts, or 'None.' if there are none." },
    ],
  },
  {
    agentId: "dsd-writer-nfr-risk",
    name: "NFR & Risk writer",
    focus: "non-functional rigor and honest risk framing",
    chapters: [
      { title: "9. Non-Functional Requirements", guidance: "The NFR targets and the highest data classification, from the facts. Note where targets are unset rather than inventing them." },
      { title: "10. Risks & Assumptions", guidance: "The risks from the facts, plus any explicit assumptions you make — clearly labelled as assumptions." },
    ],
  },
  {
    agentId: "dsd-writer-rules-roadmap",
    name: "Rules & Roadmap writer",
    focus: "business rules and a realistic delivery sequence",
    chapters: [
      { title: "11. Business Rules", guidance: "The business rules from the facts, or 'None captured yet.'" },
      { title: "12. Implementation Roadmap", guidance: "Group the work by disposition: reuse as-is, extend, new to build. Note readiness (which members are still draft). Say plainly where you are sequencing beyond the data." },
    ],
  },
]

export const CRITIC_LENSES: CriticLens[] = [
  {
    agentId: "dsd-critic-grounding",
    name: "Grounding critic",
    focus: "inventions and contradictions: any component, flow, capability, NFR, risk or value not supported by the verified facts.",
  },
  {
    agentId: "dsd-critic-completeness",
    name: "Completeness critic",
    focus: "depth and breadth: thin or generic chapters, missing required chapters, facts present in the data but omitted from the document.",
  },
  {
    agentId: "dsd-critic-clarity",
    name: "Clarity critic",
    focus: "clarity and style: marketing fluff, vague sentences, inconsistent terminology, anything an analyst could not act on.",
  },
  {
    agentId: "dsd-critic-consistency",
    name: "Consistency critic",
    focus: "cross-section consistency: numbers, component names and counts that disagree between chapters or with the architecture diagram.",
  },
]

export const WRITER_IDS = WRITER_GROUPS.map((g) => g.agentId)
export const CRITIC_IDS = CRITIC_LENSES.map((c) => c.agentId)

export function groupForSection(sectionId: string): WriterGroup | undefined {
  return WRITER_GROUPS.find((g) => g.agentId === sectionId)
}
