// UI block visibility — team-wide toggles for the component detail page.
//
// Each block can be hidden via `config.yaml` (ui.blocks.*) at the root of
// the data repo. Defaults to visible — when a key is missing or the file
// is absent, the block renders. A tab is considered visible when at least
// one of its blocks is visible; tabs that contain only one block become
// fully hidden when that block is toggled off.

export type DetailTabId =
  | "overview"
  | "technical"
  | "business"
  | "rules"
  | "blast-radius"
  | "documentation"
  | "diagrams"
  | "history"

export interface UIBlocksConfig {
  overview?: {
    heroContext?: boolean
    details?: boolean
    descriptions?: boolean
    risks?: boolean
  }
  technical?: {
    interfaces?: boolean
    relationships?: boolean
    nfr?: boolean
  }
  business?: {
    capabilities?: boolean
    data?: boolean
    processes?: boolean
  }
  rules?: { section?: boolean }
  blastRadius?: { section?: boolean }
  documentation?: { section?: boolean }
  diagrams?: { section?: boolean }
  history?: { section?: boolean }
}

export interface BlockMeta {
  tab: DetailTabId
  group: keyof UIBlocksConfig // top-level path in UIBlocksConfig
  field: string // child key on the group object
  label: string
  description: string
}

export const BLOCK_METAS: BlockMeta[] = [
  {
    tab: "overview",
    group: "overview",
    field: "heroContext",
    label: "Hero context diagram",
    description:
      "Auto-rendered mermaid combining inputs, outputs, owned data and direct relationships.",
  },
  {
    tab: "overview",
    group: "overview",
    field: "details",
    label: "Details",
    description: "ID, type, status, owner, tags, documentation maturity bar.",
  },
  {
    tab: "overview",
    group: "overview",
    field: "descriptions",
    label: "Description",
    description:
      "Long-form description of what the component does. Legacy one-liner / technical / business fields render here too on components that have not been re-saved since v0.6.",
  },
  {
    tab: "overview",
    group: "overview",
    field: "risks",
    label: "Risks",
    description: "Known risks attached to the component.",
  },
  {
    tab: "technical",
    group: "technical",
    field: "interfaces",
    label: "Interfaces",
    description: "Provided / consumed interfaces.",
  },
  {
    tab: "technical",
    group: "technical",
    field: "relationships",
    label: "Relationships",
    description:
      "Direct connections to other components (depends-on, child-of, etc.).",
  },
  {
    tab: "technical",
    group: "technical",
    field: "nfr",
    label: "Non-Functional Requirements",
    description:
      "Availability, RTO, RPO, latency, throughput, data classification, scaling.",
  },
  {
    tab: "business",
    group: "business",
    field: "capabilities",
    label: "Capabilities",
    description: "Business capabilities the component plays a role in.",
  },
  {
    tab: "business",
    group: "business",
    field: "data",
    label: "Data Perspective",
    description: "Inputs, outputs and owned data items.",
  },
  {
    tab: "business",
    group: "business",
    field: "processes",
    label: "Processes",
    description: "Business processes the component participates in.",
  },
  {
    tab: "rules",
    group: "rules",
    field: "section",
    label: "Rules & Calculations tab",
    description: "Formulas, given-when-then rules, constraints.",
  },
  {
    tab: "blast-radius",
    group: "blastRadius",
    field: "section",
    label: "Blast Radius tab",
    description:
      "Impact graph view plus the AI-generated impact memo for management.",
  },
  {
    tab: "documentation",
    group: "documentation",
    field: "section",
    label: "Documentation tab",
    description:
      "Audience- and doctype-based document generator with PDF/ERD/BPMN attachments.",
  },
  {
    tab: "diagrams",
    group: "diagrams",
    field: "section",
    label: "Diagrams tab",
    description: "List of diagrams the component appears in.",
  },
  {
    tab: "history",
    group: "history",
    field: "section",
    label: "History tab",
    description: "Commit history for the YAML file backing the component.",
  },
]

export function isBlockVisible(
  config: UIBlocksConfig | undefined,
  group: keyof UIBlocksConfig,
  field: string
): boolean {
  const groupCfg = config?.[group] as Record<string, boolean | undefined> | undefined
  return groupCfg?.[field] !== false
}

export function isTabVisible(
  config: UIBlocksConfig | undefined,
  tab: DetailTabId
): boolean {
  return BLOCK_METAS.filter((b) => b.tab === tab).some((b) =>
    isBlockVisible(config, b.group, b.field)
  )
}
