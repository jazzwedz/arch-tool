# arch-tool — Component Data Model

> **Audience.** LLMs and humans authoring or transforming component
> YAML for the `arch-tool` Team Repository catalog. This document is
> the canonical, self-contained schema reference — pass it as a system
> prompt to any model that needs to produce, validate or migrate
> components and it will have everything it needs.
>
> **Storage.** Each component is one YAML file at
> `components/<id>.yaml` in the repository the tool is pointed at.
> The repo is the source of truth; the UI is a read/write view on it.
>
> **Versioning.** The schema is permissive on read (legacy shapes
> auto-migrate) and clean on write (new saves drop deprecated fields).
> A component that has never been re-saved since a migration still
> renders correctly thanks to the read-time migration layer.

---

## 1. Top-level Component

```ts
interface Component {
  // Identity ----------------------------------------------------------
  id: string                          // kebab-case slug; required on disk
  name: string                        // human-readable; THE only required field on create
  type: ComponentType                 // default "component"
  status: ComponentStatus             // default "draft"
  owner: string                       // free-form (team / role)
  tags: string[]                      // free-form, kebab-case convention

  // Narrative --------------------------------------------------------
  description: ComponentDescription   // unified prose; see §6

  // Architectural shape ----------------------------------------------
  interfaces: ComponentInterface[]    // API surface — see §7
  relationships: ComponentRelationship[]  // ties to other components — see §8

  // Business framing -------------------------------------------------
  capabilities?: ComponentCapability[]    // see §9
  processes?: ComponentProcess[]          // see §10
  rules?: ComponentRule[]                 // formulas / rules / constraints — see §11
  risks?: string[]                        // free-form bullet list

  // Runtime data flow ------------------------------------------------
  data?: ComponentData                // inputs / outputs / owns — see §12

  // Non-functional & ops ---------------------------------------------
  nfr?: ComponentNFR                  // see §13
  diagram?: ComponentDiagram          // visual overrides — see §14

  // External registry link (type-restricted) -------------------------
  data_model?: ComponentDataModelLink // only meaningful when type === "table" — see §15

  // Legacy (read-only — see §16) -------------------------------------
  business_capabilities?: string[]    // auto-migrates → capabilities[]
}
```

### 1.1 Required vs optional, defaults

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | **yes** | — | Free-form, single line |
| `id` | yes on disk | slug of `name` | Auto-generated when omitted on create; immutable in edit |
| `type` | no | `"component"` | One of 20 — see §3 |
| `status` | no | `"draft"` | One of 3 — see §4 |
| `owner` | no | `""` | Free-form |
| `tags` | no | `[]` | string[] |
| `description.description` | no | `""` | Unified narrative |
| `interfaces` | no | `[]` | |
| `relationships` | no | `[]` | |
| All others | no | `undefined` / `null` | Dropped from saved YAML when empty |

### 1.2 Validation rules enforced by `src/lib/component-schema.ts`

- `name` must be non-empty string.
- `id` must match `^[a-zA-Z0-9_\-. ]+$` and contain no `..`.
- `type`, `status`, `relationship.type`, `interface.type`,
  `interface.direction`, `data.*.kind`, `capabilities[].role`,
  `processes[].role`, `rules[].kind`, `nfr.data_classification`,
  `nfr.scaling` must match their enum (errors otherwise).
- `data_model` on a `type !== "table"` component → **warning**, not error.
- Unknown top-level or sub-keys → **warning**, ignored on save.

---

## 2. ComponentDescription

```ts
interface ComponentDescription {
  description?: string                // unified long-form prose (THE one to write)

  // Legacy — auto-migrated at read time, dropped on next save
  oneliner?: string                   // historic card subtitle
  technical?: string                  // historic split
  business?: string                   // historic split
}
```

**Rule.** `description.description` is the canonical field. The
legacy three split into the unified field on read; new YAML should
only write `description.description`.

---

## 3. ComponentType — 20 values

The catalog organises types into three families:

### 3.1 Org hierarchy (deployment / ownership tree)

```
Boundary
└─ Context
   ├─ Application      ← Module
   ├─ Microservice     ← Module
   └─ Service          ← Module
```

| `type` | Use case |
|---|---|
| `boundary` | Security / network zone (DMZ, VPC, trust boundary) |
| `context` | Business domain or DDD bounded context |
| `application` | Monolith or COTS product |
| `microservice` | Independently deployable service |
| `service` | Generic service when "microservice" is too strict |
| `module` | Logical unit inside an application / microservice / service |

### 3.2 Data hierarchy (storage tree)

```
Database
└─ Schema             ← also valid standalone as message / API contract
   └─ Table
```

| `type` | Use case |
|---|---|
| `database` | Persistent data store (RDBMS / document / KV at the engine level) |
| `schema` | Database schema / namespace OR JSON / Avro / Protobuf / OpenAPI contract |
| `table` | Table / collection / entity inside a schema or database |

### 3.3 Standalone — no required parent/child

| `type` | Use case |
|---|---|
| `component` | **Default catch-all.** Use when none of the more specific types fits. |
| `frontend` | Web or mobile UI |
| `cache` | In-memory data layer (Redis, in-proc cache) |
| `queue` | Message broker / event bus (Kafka, RabbitMQ, SQS) |
| `data-pipeline` | ETL / streaming processing |
| `batch-job` | Scheduled processing (cron, Airflow DAG) |
| `storage` | Blob / file / object storage (S3, GCS, NFS) |
| `gateway` | API gateway / integration point |
| `external` | Third-party system outside the org's control |
| `platform` | Shared infrastructure platform (k8s cluster, IaaS tenant) |
| `library` | Shared code / SDK |

### 3.4 Picker order (used by the form's default dropdown)

```
component, service, microservice, frontend,
database, table, schema, cache, queue,
data-pipeline, batch-job, storage,
gateway, external, platform, library,
context, boundary, application, module
```

---

## 4. ComponentStatus

```ts
type ComponentStatus = "draft" | "production" | "deprecated"
```

| value | meaning |
|---|---|
| `draft` | Under design / not yet live (default for new entries) |
| `production` | Live, actively maintained |
| `deprecated` | Still exists but being phased out |

---

## 5. ComponentDataModelLink (only on `type: table`)

```ts
interface ComponentDataModelLink {
  entity: string                      // entity name in the external data model registry
}
```

When configured (via env vars `DATA_MODEL_REGISTRY_*`), the detail
page fetches the entity's attributes and relationships **live** from
the registry. Catalog never copies them into the YAML — registry
remains the source of truth.

---

## 6–14 see below. Each shape lives in its own section.

---

## 7. ComponentInterface

```ts
interface ComponentInterface {
  name?: string                       // short human label ("Orders API", "Stock checker")
  direction: "provides" | "consumes"
  type:
    | "rest" | "grpc" | "async" | "db" | "file"
    | "human" | "info" | "link" | "data"
  target?: string                     // component id OR free external label
  description: string                 // required: what it does
}
```

### 7.1 Connector types (9)

| `type` | Visual cue (drawio) | Use case |
|---|---|---|
| `rest` | Solid blue arrow | HTTP REST API |
| `grpc` | Solid purple arrow | gRPC |
| `async` | Dashed red arrow | Async / event-driven (Kafka topic, queue) |
| `db` | DB many-end | Direct DB connection |
| `file` | Dashed grey arrow | File / batch handoff |
| `human` | Dashed orange arrow | Manual / user action |
| `info` | Solid thick blue | Informational edge (no automated flow) |
| `link` | Plain line | Generic linkage |
| `data` | Solid thick pink | Data-flow edge when `db` / `async` would mislead |

### 7.2 Semantics

- `direction: "provides"` → this component exposes the API; `target`
  is the caller (consumer).
- `direction: "consumes"` → this component calls the API; `target`
  is the provider.
- `target` is either a known component id (catalog will render it as
  a clickable link with the type icon) OR free text (external system,
  partner, future component).

### 7.3 Mirror rule (used by Consistency Check)

If A declares `provides type=X target=B`, B should declare
`consumes type=X target=A`. The two sides are deduped to a single
edge on the global Architecture diagram.

---

## 8. ComponentRelationship

```ts
interface ComponentRelationship {
  target: string                      // component id (typically) or free label
  type:
    | "parent-of" | "child-of"
    | "depends-on" | "communicates-with"
    | "reads-from" | "writes-to"
    | "fallback"
  connector?:
    | "rest" | "grpc" | "async" | "db" | "file"
    | "human" | "info" | "link" | "data"
  description?: string
}
```

### 8.1 Relationship type semantics

| `type` | Reads as | Has inverse? |
|---|---|---|
| `parent-of` | This is parent of target | **yes** → `child-of` |
| `child-of` | This is child of target | **yes** → `parent-of` |
| `depends-on` | This requires target to work | no (directional) |
| `communicates-with` | This and target exchange data | **yes** (symmetric) |
| `reads-from` | This reads data from target | no (directional) |
| `writes-to` | This writes data to target | no (directional) |
| `fallback` | This is fallback for target | no (directional) |

### 8.2 Inverse labels (display-only, computed on detail page)

When component A declares a relationship targeting B, B's detail
page shows the **inverse** label (see `INVERSE_RELATIONSHIP_LABELS`
in `src/lib/constants.ts`):

| Declared on source | Shown on target |
|---|---|
| `parent-of` | `Child of` |
| `child-of` | `Parent of` |
| `depends-on` | `Required by` |
| `communicates-with` | `Communicates with` |
| `reads-from` | `Read by` |
| `writes-to` | `Written to by` |
| `fallback` | `Has fallback` |

### 8.3 Mirror rule (used by Consistency Check)

- `parent-of` ↔ `child-of` — both sides should declare the
  reciprocal direction.
- `communicates-with` — symmetric; both sides should declare.
- All other types are directional by design — no required reverse.

---

## 9. ComponentCapability

```ts
interface ComponentCapability {
  name: string                        // free-form business capability
  role: "owner" | "contributor" | "consumer" | "indirect"
  description?: string
}
```

| `role` | Meaning |
|---|---|
| `owner` | Implements / runs the capability |
| `contributor` | Assists (logs, metrics, side actions) |
| `consumer` | Uses the capability |
| `indirect` | Touches it incidentally (auto-migrated from legacy `business_capabilities`) |

A non-exhaustive starter list lives in
`constants.ts → BUSINESS_CAPABILITIES` (Customer Management, Order
Management, Billing & Invoicing, …) — used as autocomplete in the
form. Free text is accepted.

---

## 10. ComponentProcess

```ts
interface ComponentProcess {
  name: string                        // business process
  role: "owner" | "participant" | "listener" | "trigger"
  activity?: string                   // short label of what the component does in the process
  description?: string
}
```

| `role` | Meaning |
|---|---|
| `owner` | Runs the whole process end-to-end |
| `participant` | Performs activities in the process |
| `listener` | Observes events emitted by the process |
| `trigger` | Initiates the process |

---

## 11. ComponentRule

```ts
interface ComponentRule {
  name: string
  kind: "formula" | "rule" | "constraint"
  summary?: string                    // one-line, applies to every kind

  // kind = "formula" -----------------------------------------------
  formula?: string                    // single expression line, e.g. "premium = baseRate * (1 + riskFactor)"

  // kind = "rule" --------------------------------------------------
  given?: string                      // Given / When / Then
  when?: string
  then?: string

  // kind = "constraint" --------------------------------------------
  enforced_in?: string[]              // component ids where this invariant is enforced

  description?: string                // free-form prose, any kind
}
```

| `kind` | Use case |
|---|---|
| `formula` | A calculation expressed as an expression |
| `rule` | A behaviour expressed as Given / When / Then |
| `constraint` | An invariant that must always hold |

---

## 12. ComponentData

```ts
interface ComponentData {
  owns?: DataItem[]                   // source-of-truth for these data items
  inputs?: DataItem[]                 // items this component receives
  outputs?: DataItem[]                // items this component emits
}

interface DataItem {
  name: string                        // free-form data name (e.g. "OrderEvent")
  kind: DataKind
  source?: string                     // component id where item originates (for inputs)
  consumers?: string[]                // component ids that receive this item (for outputs)
  purpose?: string
  description?: string
}
```

### 12.1 DataKind — 16 values in three groups

**Format kinds** (physical / structural shape)

| `kind` | Meaning |
|---|---|
| `table` | Tabular row in a store |
| `file` | File / blob |
| `stream` | Continuous data stream |
| `message` | Discrete message on a queue / topic |
| `form` | Form input from a user |

**Business kinds** (semantic flow artefact)

| `kind` | Meaning |
|---|---|
| `event` | Domain event (something happened) |
| `command` | Command to do something |
| `document` | Document artefact (PDF, contract, …) |
| `decision` | Decision output from a rule / policy |
| `signal` | Notification / signal |

**Technical kinds** (state / runtime)

| `kind` | Meaning |
|---|---|
| `business` | Business state (the "real" data this component manages) |
| `reference` | Reference / lookup data |
| `cache` | Cached state (derived) |
| `config` | Configuration |
| `transient` | Short-lived runtime state |
| `logs` | Logs / telemetry |

### 12.2 Mirror rule (used by Consistency Check)

If A declares `inputs: [{ name: X, source: B }]`, then B should
declare an output (or owned item) **with the same `name: X`** and
include A in `consumers`. The catalog UI links source ↔ output and
input ↔ consumer bidirectionally on the detail pages.

If matching the other side's input/output names fails by mere
whitespace ("OrderEvent" vs "Order Event"), the consistency
checker treats them as different items.

### 12.3 Legacy keys

Older YAML used `data.consumes` and `data.produces`. They are
read-migrated to `data.inputs` and `data.outputs` respectively;
new saves write only the canonical names.

---

## 13. ComponentNFR

```ts
interface ComponentNFR {
  availability?: string               // free-form (e.g. "99.9%", "Tier 1")
  rto?: string                        // recovery time objective
  rpo?: string                        // recovery point objective
  max_latency?: string                // e.g. "p99 < 200ms"
  throughput?: string                 // e.g. "1k rps sustained"
  data_classification?: "public" | "internal" | "confidential" | "restricted"
  scaling?: "horizontal" | "vertical" | "none"
}
```

---

## 14. ComponentDiagram

```ts
interface ComponentDiagram {
  color?: string                      // override fill colour on global diagram
  shape?: string                      // future use — current renderer ignores
}
```

Optional visual overrides for the global Architecture overview and
drawio export. When absent, the type-derived defaults from
`TYPE_COLORS` apply.

---

## 15. Backlinks & inverse semantics (computed, not stored)

The catalog computes a few derived views by scanning all components
at request time — **none of these are stored on disk**. Useful to
know when generating components programmatically:

| Derived view | What it is | Endpoint |
|---|---|---|
| Inbound relationships | Inverse rows on the detail page | `/api/components/[id]/inbound-relationships` |
| Inbound interfaces | "Referenced by interfaces from" backlinks | `/api/components/[id]/inbound-interfaces` |
| Inbound data refs | Downstream consumers / upstream emitters | `/api/components/[id]/inbound-data` |
| Combined relationships | Outbound + inverted inbound, deduped | computed in `/component/[id]/page.tsx` |

LLMs producing components should **NOT add inverse declarations
defensively** — declare on the natural side only, the UI surfaces
the reciprocal direction automatically. Adding both sides
duplicates the disk state and offers no extra information; the
Consistency Check intentionally treats only the MISSING-mirror case
as an issue, not the doubly-declared case.

---

## 16. Backward compatibility (read-only, never write)

| Legacy field | Migrates to | Notes |
|---|---|---|
| `description.oneliner` | kept as-is (rare use) | Card subtitle in old UI |
| `description.technical` | `description.description` | Joined with `business` when both exist |
| `description.business` | `description.description` | Joined with `technical` when both exist |
| `business_capabilities: string[]` | `capabilities: [{ name, role: "indirect" }]` | One entry per legacy string |
| `data.consumes` | `data.inputs` | 1-to-1 rename |
| `data.produces` | `data.outputs` | 1-to-1 rename |

The migration happens at read time in `src/lib/github.ts`
(`migrateComponent`). New saves drop the legacy fields entirely so
the disk converges to canonical shape over time.

---

## 17. Annotated example

```yaml
# components/order-service.yaml

id: order-service                  # required; usually slug of name
name: Order Service                # the only mandatory field on create
type: microservice                 # see §3
status: production                 # draft | production | deprecated
owner: payments-team               # free-form
tags:                              # free-form list
  - backend
  - payments-domain

description:
  description: |                   # unified narrative
    Owns the order lifecycle from creation through fulfilment.
    Publishes domain events on every state transition.

interfaces:                        # §7
  - name: Orders API
    direction: provides
    type: rest
    target: web-frontend           # consumer
    description: REST endpoint for placing and querying orders.
  - name: Inventory lookup
    direction: consumes
    type: rest
    target: inventory-service
    description: Reads available stock when accepting a new order.
  - name: Order events
    direction: provides
    type: async
    target: analytics-pipeline
    description: Emits OrderCreated / OrderShipped on Kafka.

relationships:                     # §8
  - target: payments-context
    type: child-of                 # this lives inside payments-context
    description: Owned by the Payments bounded context.
  - target: inventory-service
    type: depends-on
    connector: rest
  - target: notification-service
    type: communicates-with
    connector: async

capabilities:                      # §9
  - name: Order Management
    role: owner
    description: Source of truth for orders.
  - name: Payment Processing
    role: consumer

processes:                         # §10
  - name: Order to Cash
    role: participant
    activity: Creates order, debits inventory, hands off to fulfilment.

rules:                             # §11
  - name: Order total formula
    kind: formula
    formula: total = sum(line_items.price * line_items.qty) + shipping
    summary: How an order's total amount is computed.
  - name: Cancel on payment failure
    kind: rule
    given: Order is in state PENDING_PAYMENT
    when: Payment attempt fails three times
    then: Transition order to CANCELLED and release inventory
  - name: No negative quantities
    kind: constraint
    summary: All line items must have quantity ≥ 1.
    enforced_in:
      - order-service
      - web-frontend

data:                              # §12
  owns:
    - name: Order
      kind: business
      description: The order aggregate root.
  inputs:
    - name: StockLevel
      kind: reference
      source: inventory-service
      purpose: Validate availability at order time.
  outputs:
    - name: OrderCreated
      kind: event
      consumers:
        - analytics-pipeline
        - notification-service
      purpose: Triggers downstream fulfilment and customer notification.
    - name: OrderShipped
      kind: event
      consumers:
        - analytics-pipeline
        - notification-service

nfr:                               # §13
  availability: "99.95%"
  rto: 15 minutes
  rpo: 1 minute
  max_latency: p99 < 300ms
  throughput: 500 rps sustained
  data_classification: confidential
  scaling: horizontal

risks:
  - Single point of failure in the order state machine.
  - Inventory deduction is eventually consistent — overselling possible
    under high concurrency.
```

---

## 18. Quick reference for code generators

When asking an LLM to produce a new component, paste this checklist
together with the model document:

- [ ] `name` is set (the only hard requirement).
- [ ] `id` either omitted (will be slugified) or set to a kebab-case
      slug that does not collide with existing ids.
- [ ] `type` is one of the 20 values in §3 (default `component`).
- [ ] `status` is one of `draft` / `production` / `deprecated`
      (default `draft`).
- [ ] Every `relationship.type` is in §8.1's enum.
- [ ] Every `interface.direction` ∈ {`provides`, `consumes`} and
      `interface.type` is in §7.1.
- [ ] Every `data.{inputs,outputs,owns}[].kind` is in §12.1.
- [ ] `nfr.data_classification` if set ∈ §13's enum.
- [ ] `nfr.scaling` if set ∈ §13's enum.
- [ ] `data_model` only on `type: table` (warning otherwise).
- [ ] No legacy fields (`description.oneliner`, `description.technical`,
      `description.business`, `business_capabilities`, `data.consumes`,
      `data.produces`) — write the canonical shape only.
- [ ] Do not pre-declare inverse relationships on the target; the UI
      computes those (§15).

When asking an LLM to **migrate** existing YAML, point it at §16 —
that table is the full set of read-time migrations.

---

## 19. Export / import round-trip

The catalog round-trips through YAML in exactly the on-disk shape:

- **Export single** — `GET /api/components/<id>/export` (or the
  *Download YAML* button on the detail page) returns one component as
  its canonical YAML document.
- **Export all** — `GET /api/admin/export-yaml` (or the *Export YAML*
  button in the catalog header) returns a **multi-document bundle**:
  every component as a separate YAML document, `---` separated, with a
  leading comment header. Parse with `yaml.loadAll`.
- **Import** — paste or upload either a single document or a bundle in
  the Import dialog (`POST /api/components/import`). The `onConflict`
  mode decides what happens when an incoming `id` already exists:
  `update` (default — overwrite the existing component), `create`
  (append `-2`, keep both), or `skip`.

Exported YAML is byte-identical to what is stored on disk (shared
`src/lib/component-yaml.ts` serializer), so the edit-in-place workflow
is: export → edit the YAML → import with `onConflict: update`.
