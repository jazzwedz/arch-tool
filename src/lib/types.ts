// -------------------------- v2 schema: ComponentLink --------------------------
//
// `links[]` replaces the legacy `interfaces[]` and `relationships[]`
// arrays. One primitive describes every edge between this component
// and another. Six roles cover the cases the old shape carried:
//
//   calls       — this actively calls / consumes from target
//                 (was: interfaces[provides=consumes], relationships[depends-on],
//                  relationships[communicates-with], relationships[fallback])
//   serves      — this exposes / provides to target
//                 (was: interfaces[provides])
//   part-of     — this is contained in target
//                 (was: relationships[child-of])
//   contains    — this contains target
//                 (was: relationships[parent-of])
//   reads-from  — this reads data from target
//                 (was: relationships[reads-from])
//   writes-to   — this writes data to target
//                 (was: relationships[writes-to])
//
// Mirror pairs (consistency check + UI dedup):
//   calls    ↔ serves
//   part-of  ↔ contains
//
// `reads-from` / `writes-to` are directional with no required reverse
// (the target is passive — typically a database / storage / queue).

export type LinkRole =
  | "calls"
  | "serves"
  | "part-of"
  | "contains"
  | "reads-from"
  | "writes-to"

export type LinkProtocol =
  | "rest"
  | "grpc"
  | "async"
  | "db"
  | "table"
  | "file"
  | "human"
  | "info"
  | "link"
  | "data"

export interface ComponentLink {
  /** Component id OR free-form external label. */
  target: string
  role: LinkRole
  /** Optional — typically omitted for `part-of` / `contains`. */
  protocol?: LinkProtocol
  /** Short human label — e.g. "Orders API", "Stock checker". */
  name?: string
  /** What happens on this edge. */
  description?: string
}

// -------------------------- legacy shapes --------------------------

/**
 * @deprecated v2: superseded by ComponentLink with role `calls` / `serves`.
 * Read-time migration in `migrateComponent` converts every entry into
 * `links[]` and drops this field on the next save.
 */
export interface ComponentInterface {
  /**
   * Short human-readable name for the interface — e.g. "Orders API",
   * "Stock checker", "Inventory snapshot". Optional and unrestricted;
   * legacy components that have only `description` keep rendering the
   * description as the primary label so nothing on disk needs editing.
   */
  name?: string
  direction: "provides" | "consumes"
  type:
    | "rest"
    | "grpc"
    | "async"
    | "db"
    | "file"
    | "human"
    | "info"
    | "link"
    | "data"
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

/**
 * @deprecated v2: superseded by ComponentLink with role mapped per
 * the table in §LinkRole above. Read-time migration converts every
 * entry into `links[]` and drops this field on the next save.
 */
export interface ComponentRelationship {
  target: string
  type: RelationshipType
  connector?:
    | "rest"
    | "grpc"
    | "async"
    | "db"
    | "file"
    | "human"
    | "info"
    | "link"
    | "data"
  description?: string
}

export interface ComponentDiagram {
  color?: string
  shape?: string
}

export interface ComponentDescription {
  /** Short one-line summary. Used as a card subtitle / hover tooltip. */
  oneliner?: string
  /**
   * Unified long-form description. This is what new components write
   * and what the UI shows. Legacy components that stored split
   * technical / business fields keep them — migrateComponent backfills
   * `description` from them at read time so the form sees one merged
   * value; on the next save the legacy fields drop and only this one
   * stays.
   */
  description?: string
  /** @deprecated use `description` instead. Read at load time only. */
  technical?: string
  /** @deprecated use `description` instead. Read at load time only. */
  business?: string
}

export type ComponentType =
  // Generic "component" — the default for new entries and a safe
  // fallback when the analyst has not yet decided what shape the thing
  // is. Listed first so it shows up at the top of the type picker.
  | "component"
  | "service"
  | "microservice"
  | "frontend"
  | "database"
  | "table"
  | "schema"
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

// Optional link to an entity in an external data model registry. Only
// meaningful on components of type `table`. The catalog stores just
// the entity name; the registry remains the source of truth for the
// attributes and relationships, which are fetched live for display.
export interface ComponentDataModelLink {
  entity: string
}

export interface Component {
  /**
   * On-disk schema version.
   *   `undefined` / `1` → legacy (interfaces + relationships authoritative).
   *   `2` → v2, links[] authoritative; legacy fields absent.
   *
   * The read-time migration in `migrateComponent` sets this to 2 in
   * memory whenever it populates `links[]`. The first save after that
   * persists v2 and drops the legacy fields from disk.
   */
  schema_version?: number
  id: string
  name: string
  type: ComponentType
  data_model?: ComponentDataModelLink
  status: ComponentStatus
  owner: string
  tags: string[]
  description: ComponentDescription
  /** v2 — single primitive for every edge to another component. */
  links?: ComponentLink[]
  /** @deprecated v2: read-migrated to links[], dropped on next save. */
  interfaces?: ComponentInterface[]
  /** @deprecated v2: read-migrated to links[], dropped on next save. */
  relationships?: ComponentRelationship[]
  risks?: string[]
  /** @deprecated use `capabilities` (rich object) instead. Migrated at read time. */
  business_capabilities?: string[]
  capabilities?: ComponentCapability[]
  /**
   * @deprecated v2 Phase 2: `data{}` is gone. Every input/output is
   * now a link with role `reads-from` / `writes-to`, the DataItem
   * name + purpose carrying over as link.name + link.description.
   * `data.owns` is dropped entirely. Field kept on the type only so
   * legacy YAML still parses; migration drops it on read.
   */
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
