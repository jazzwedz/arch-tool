export interface ComponentInterface {
  direction: "provides" | "consumes"
  type: "rest" | "grpc" | "async" | "db" | "file" | "human" | "info" | "link"
  target?: string
  description: string
}

export type RelationshipType =
  | "parent-of"
  | "child-of"
  | "depends-on"
  | "communicates-with"
  | "reads-from"
  | "writes-to"
  | "fallback"

export interface ComponentRelationship {
  target: string
  type: RelationshipType
  connector?: "rest" | "grpc" | "async" | "db" | "file" | "human" | "info" | "link"
  description?: string
}

export interface ComponentDiagram {
  color?: string
  shape?: string
}

export interface ComponentDescription {
  oneliner: string
  technical: string
  business: string
}

export type ComponentType =
  | "microservice"
  | "frontend"
  | "database"
  | "queue"
  | "gateway"
  | "external"
  | "platform"
  | "library"
  | "data-pipeline"
  | "storage"
  | "batch-job"
  | "cache"
  | "context"
  | "boundary"
  | "application"
  | "module"

export type ComponentStatus = "draft" | "production" | "deprecated"

export type DataClassification = "public" | "internal" | "confidential" | "restricted"
export type ScalingModel = "horizontal" | "vertical" | "none"

export interface ComponentNFR {
  availability?: string
  rto?: string
  rpo?: string
  max_latency?: string
  throughput?: string
  data_classification?: DataClassification
  scaling?: ScalingModel
}

export type CapabilityRole = "owner" | "contributor" | "consumer" | "indirect"

export interface ComponentCapability {
  name: string
  role: CapabilityRole
  description?: string
}

export type DataKind =
  // Format kinds (the physical / structural shape of the artefact)
  | "table"
  | "file"
  | "stream"
  | "message"
  | "form"
  // Business kinds (semantic flow artefacts)
  | "event"
  | "command"
  | "document"
  | "decision"
  | "signal"
  // Technical kinds (state / cached / streamed)
  | "business"
  | "reference"
  | "cache"
  | "config"
  | "transient"
  | "logs"

export interface DataItem {
  name: string
  kind: DataKind
  /** Component id where this item originates (for inputs). */
  source?: string
  /** Component ids that receive this item (for outputs). */
  consumers?: string[]
  purpose?: string
  description?: string
}

export interface ComponentData {
  /** Items the component is the source-of-truth for. */
  owns?: DataItem[]
  /** Items the component receives (formerly `consumes`). */
  inputs?: DataItem[]
  /** Items the component emits (formerly `produces`). */
  outputs?: DataItem[]
}

export type ProcessRole = "owner" | "participant" | "listener" | "trigger"

export interface ComponentProcess {
  name: string
  role: ProcessRole
  /** Free-text label of what the component does in this process. */
  activity?: string
  description?: string
}

export type RuleKind = "formula" | "rule" | "constraint"

export interface ComponentRule {
  name: string
  kind: RuleKind
  /** One-line summary, applies to every kind. */
  summary?: string
  /** Optional long-form prose. */
  description?: string
  /** Used when kind === "formula" — a single expression line. */
  formula?: string
  /** Used when kind === "rule" (Given / When / Then). */
  given?: string
  when?: string
  then?: string
  /** Used when kind === "constraint" — component ids where this invariant is enforced. */
  enforced_in?: string[]
}

export interface Component {
  id: string
  name: string
  type: ComponentType
  status: ComponentStatus
  owner: string
  tags: string[]
  description: ComponentDescription
  interfaces: ComponentInterface[]
  relationships: ComponentRelationship[]
  risks?: string[]
  /** @deprecated use `capabilities` (rich object) instead. Migrated at read time. */
  business_capabilities?: string[]
  capabilities?: ComponentCapability[]
  data?: ComponentData
  processes?: ComponentProcess[]
  rules?: ComponentRule[]
  nfr?: ComponentNFR
  diagram?: ComponentDiagram
}

export interface ComponentWithSha extends Component {
  sha: string
}

export interface Diagram {
  name: string
  content: string
}

export interface DiagramWithSha extends Diagram {
  sha: string
}
