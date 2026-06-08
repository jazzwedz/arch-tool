# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project loosely follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **All 4 dependabot moderate advisories cleared (`npm audit` → 0).**
  `hono` and `qs` (transitive via the `shadcn` CLI) bumped to patched
  patch releases; the nested `postcss` (`<8.5.10`, XSS in CSS stringify)
  forced to `^8.5.10` via an npm `overrides: { postcss: "$postcss" }`
  entry plus a direct-dep bump — avoiding the `npm audit fix --force`
  path that would have downgraded Next to 9.3.3. Next picked up the
  15.5.18 → 15.5.19 patch in the same install. Build + typecheck green.

### Fixed

- **Rules-import (AI rule analysis) crashed with “Unexpected token '<'”.**
  The import-rules-from-documents dialog called `res.json()` directly on
  the analysis response. When the request hit a gateway timeout (long AI
  run), an upload-too-large rejection, or an expired session — all of
  which return an HTML page, not JSON — parsing threw the cryptic
  `Unexpected token '<', "<!DOCTYPE"...`. The dialog now reads the body
  defensively and shows a clear, status-aware message (timeout → try a
  smaller/focused source; 413 → file too large; 401/403 → session
  expired) instead of the raw parse error.

- **Duplicate / doubled links cleaned up.** Two separate causes made a
  component's Links look multiplied: (1) the same logical edge declared
  from both sides (this `reads-from` X + X `writes-to` this) was shown as
  two rows/edges, and the hero diagram drew a fresh box per link so one
  peer appeared several times; (2) genuinely redundant rows in the data
  (e.g. `part-of` the same target twice with different labels). Fixes:
  - The detail page now collapses mirror pairs correctly (via
    `LINK_ROLE_INVERSE`, not label-string matching) so an interaction
    shows **once** per component page, and de-dupes a component's own
    links; the hero diagram draws **one box per peer**.
  - The Consistency check's **Duplicate links** now treats containment
    (`part-of` / `contains`) as unique-per-target — it flags a second
    `part-of X` even when the name differs, and the fix keeps one.
    Non-containment roles still keep `name`, so two `reads-from X` for
    two different datasets are left intact.

- **Import redirect hit a 404.** After a single-component import the
  dialog pushed to `/component/<id>/edit`, but the edit route lives at
  `/edit/<id>` — the component saved fine yet the redirect 404'd (and
  logged it). Fixed the redirect path.

- **Settings toggles for Capabilities / Processes / NFR / Risks now
  actually show the card.** The four cards on the detail page were
  gated on both the Settings visibility flag AND data-presence
  (`component.processes && component.processes.length > 0`, etc.).
  Result: turning the toggle ON in Settings had no effect when the
  component had no data yet — the card stayed hidden, and the per-
  block Edit dialog the analyst would use to add the first entry was
  unreachable. Fix: drop the data-presence predicate from the card
  conditional, render the card whenever the Settings flag is on, and
  show an empty-state message inside that points at the Edit button.

- **Links card: target shows raw id instead of name on first paint.**
  The detail page renders the Links card before `/api/components`
  finishes loading the catalog snapshot used to resolve `target` →
  human name. The fallback path was treating "not yet loaded" the
  same as "really missing" — the analyst saw a red `missing` badge
  next to every link until the fetch finished. Added an explicit
  `allComponentsLoaded` flag: while loading we show the raw id with
  no badge; once loaded, only truly absent targets get the warning.

- **Component picker only showed 8 options.** When adding or editing
  a Link, the typeahead dropdown opened with at most the first 8
  components in the catalog and the rest were unreachable without
  typing. Cap raised to 500 (effectively unlimited for any real
  catalog; the dropdown is `max-h-64 overflow-y-auto` so the list
  scrolls). The analyst sees every option from the moment the
  dropdown opens.

### Added

- **Analyst quick-start guide (`/guide`).** A friendly one-pager (new
  top-nav **Guide** entry) for the pilot kickoff: the ideal flow
  (start a Solution → check components → create new ones if needed → put
  the detail/rules on the component), a “golden rule” callout, a
  what-and-why of each repo area (Components / Solutions / Processes /
  Diagrams), and a “first 15 minutes” checklist with quick links.

- **Solution DSD opens in the same rich doc modal as components.** The
  generated Detailed Solution Description now opens in a proper viewer
  (styled markdown + rendered mermaid) with **Copy Markdown** and **Save
  as PDF** (clean print window), matching the component documentation
  experience. Extracted into a reusable `components/GeneratedDocModal`
  (an optional Publish action is built in for a later Confluence-for-
  solutions hook). The Documentation tab now shows View / Regenerate.

- **Solutions — reminder that detail lives on the component.** Info notes
  in the composer (Skeleton step), the solution detail Members tab and the
  editor make clear that a solution only wires components together — a
  component's detailed functionality (logic, rules, NFR, capabilities,
  processes) is edited on the component itself; new components added in a
  solution are created as empty drafts to flesh out afterwards.

- **Solutions composer — description field + AI assist.** Step 1 (Intent)
  now has a **Description** textarea. With goal + description filled, a
  **Pre-fill with AI** button opens a modal that calls the LLM (the same
  client used elsewhere) with the intent plus the full catalog export
  (reuses `buildCatalogMarkdown`) and proposes the rest of the solution —
  delivered capabilities/processes, member components (chosen from real
  catalog ids), new components for gaps, and flows. After review, **Apply**
  pre-fills every wizard step (skeleton + flows) so the analyst only
  tweaks and creates. New endpoint `POST /api/solutions/ai-compose`;
  member/flow ids are validated against the catalog server-side.

- **Solutions are now editable and deletable.** The detail page gets
  **Edit** and **Delete** (with confirm) buttons. New editor at
  `/solutions/[id]/edit` to change details (name / status / owner / goal
  / description), delivers (capability & process chips), members
  (disposition, role, add existing or add brand-new, remove) and flows
  (add / remove). Saves via PUT with the loaded sha; brand-new members
  added in the editor are created as draft components on save. The
  delivers ChipPicker was extracted to a shared `components/ChipPicker`
  used by both the composer and the editor.

- **Solutions wizard — tidier delivers picker + manual new components.**
  Step 1's capability/process pickers now show selected chips on top
  (one-click remove), a search box to filter the (otherwise long) list,
  and a **+ Add “…”** action to create a capability/process that isn't in
  the catalog yet. Step 2 gains **Add a new component** (name + type) —
  a brand-new component declared straight in the composer; on Create it
  is added to the catalog as a draft, so it is then usable everywhere,
  including the component link editor.

- **Solutions — compose offerings from existing components (Phase 1).**
  New top-nav entry (between Catalog and Processes) and a `Solution`
  entity stored separately at `solutions/<id>.yaml` (references catalog
  components by id — many-to-many, so the component catalog stays clean).
  Phase 1 ships the foundation: types + enums, YAML serializer
  (`solution-yaml.ts`), store (`solutions.ts`), CRUD API
  (`/api/solutions`, `/api/solutions/[id]`), a Solutions list page and a
  read-only detail page (Overview with a member-scoped diagram, Members,
  Flows, Delivers, NFR & Risks), and the design doc `docs/SOLUTIONS.md`.
  The deterministic composer wizard and DSD generation land in later
  phases.
- **Solutions — click-first composer wizard (Phase 2).** `/solutions/new`:
  a 4-step wizard (Intent → Skeleton → Flows → Review) that needs almost
  no typing. A deterministic proposer (`solution-proposer.ts`) matches the
  delivered capabilities/processes against component metadata and proposes
  members (ranked, with a reason), flags gaps as new draft components, and
  seeds existing links between members. The analyst ticks/segments their
  way through; **Create** atomically creates approved gap components
  (`status: draft`, pre-filled to close the gap) then saves the solution.
  Same `Proposal` shape leaves the door open for an LLM proposer later.
- **Solutions — DSD generation + promote flows (Phase 3).** The solution
  detail page gains a **Documentation** tab that generates a **Detailed
  Solution Description (DSD)** by reusing the existing Generate pipeline's
  `detailed-solution` doc type (the same nicely-formatted generator used
  elsewhere); context = the solution YAML + its member components' YAML.
  The Flows tab gains **Promote proposed flows**
  (`POST /api/solutions/[id]/promote-flows`) which writes the proposed
  flows into the member components' real `links[]` and flips them to
  existing — the to-be becomes the as-is.

- **Processes overview page (`/processes`).** New top-nav entry next to
  Catalog. Aggregates every business process declared anywhere in the
  catalog (each component's `processes[]`) into one list, and shows
  per process which components support it and in what role
  (owner / participant / listener / trigger), with their activity.
  Filter box matches by process or component name; rows link to the
  component detail.

- **Consistency check now flags duplicate links.** A new **Duplicate
  links** category detects the same link (same `target` + `role` +
  `protocol` + `name`) declared more than once on a component — the
  one-click fix keeps the first occurrence and removes the rest
  (`dedupeLink`). It also fixes the list appearing to *multiply*:
  duplicate links used to emit the same mirror suggestion several times
  (the mirror id ignores `name`); issues are now deduped by id, so each
  gap shows once.

- **Partial / merge import (`onConflict: merge`).** A new **Merge
  fields** mode in the Import dialog patches only the top-level fields a
  YAML carries onto an existing component matched by `id` — e.g. paste
  just `id` + `nfr` to replace the NFR block and leave everything else
  intact. Implemented as merge-then-validate: the patch overrides the
  existing component's fields (shallow), the merged result is run
  through the full schema validator, then saved with the existing sha.
  Requires an `id` of an existing component (errors otherwise). Works
  per-document in a bundle too; the report lists the patched fields.

- **YAML export — single component and whole catalog.** A
  **Download YAML** button on the component detail page exports that
  component as its canonical v2 YAML; an **Export YAML** button in the
  catalog header exports the entire catalog as one round-trippable
  multi-document bundle (`---` separated). Both are byte-identical to
  what is written to disk (same `componentToYaml` serializer). Raw URLs
  for curl / automation: `GET /api/components/<id>/export` and
  `GET /api/admin/export-yaml`.
- **Bundle import + upsert.** The Import dialog now accepts a
  multi-document YAML bundle (and a `.yaml` file upload, alongside
  paste), so the whole catalog can be re-imported in one go. Each
  document is validated independently and shown with a per-document
  preview; the result is a created / updated / copied / skipped /
  errors report. New shared serializer module `src/lib/component-yaml.ts`
  (`normaliseForSave`, `componentToYaml`, `catalogToYaml`) and validator
  helpers `validateComponentObject` / `validateComponentDocs`.

- **`table` protocol on links + connectors.** Joins the existing
  protocol set (`rest / grpc / async / db / file / human / info /
  link / data`) for cases where the data flow targets a specific
  table rather than a database engine as a whole. ER-many arrow,
  orange (`#d97706`) — matches the existing `table` component-type
  palette. Wired into `LinkProtocol`, `CONNECTOR_TYPES`,
  `LINK_PROTOCOLS`, the form picker, the drawio library export, and
  the diagrams builder edge palette.

### Changed

- **Architecture overview groups by containment hierarchy.** The
  "Group by type" toggle (which dropped every `context` into one shared
  "Context" frame, scattering each context's members across other
  type frames) is replaced by **"Group by hierarchy"**: each component
  now nests inside the frame of what it is `part-of`, transitively —
  Boundary ⊃ Context ⊃ Application/Microservice/Service ⊃ Module (and
  Database ⊃ Schema ⊃ Table). The part-of / contains edges are no longer
  drawn — the nesting *is* the edge. Anything outside a hierarchy falls
  back to type clustering. `buildArchitectureMermaid`'s `groupByType`
  option became `groupByContainment`.

- **`docs/COMPONENT_MODEL.md` rewritten for schema v2.** The canonical
  LLM-facing schema reference still described the v1 shape
  (`interfaces[]` + `relationships[]` + `data{}`) it predated. Rewritten
  around the `links[]` primitive: the 6 roles and 3 mirror pairs
  (`calls`↔`serves`, `part-of`↔`contains`, `reads-from`↔`writes-to`),
  the 10 protocols, inverse display labels, the consistency mirror rule,
  a full v1→v2 migration table (including `data.owns` and the 16-value
  `DataKind` ontology being dropped), and a `links[]`-based annotated
  example + code-generator checklist. Backlinks section updated to the
  single `inbound-links` endpoint.
- **Import now updates existing components by default.** Previously the
  importer was create-only: an incoming `id` that already existed was
  auto-renamed to `-2`. The `/api/components/import` endpoint now takes
  an `onConflict` mode — **`update`** (default, overwrite the existing
  component with the same id, sha-aware), `create` (the old
  rename-to-`-2` behaviour), or `skip` — selectable in the Import
  dialog. This makes the YAML round-trip (export → edit → re-import) a
  true edit of existing components, not a duplicate.
- **Component serialization centralised.** `saveComponent` and every
  export path now share `src/lib/component-yaml.ts`; the `normaliseForSave`
  strip-and-stamp helper moved there out of `github.ts`. On-disk and
  exported YAML are guaranteed identical.

- **Technical + Business tabs collapse into one "Properties" tab.** The
  Technical (Links, NFR) and Business (Capabilities, Processes) tabs
  carried four cards between them — light enough to live on a single
  tab. They now share the new **Properties** tab. The `UIBlocksConfig`
  group keys (`technical`, `business`) are unchanged so existing
  `config.yaml` toggles keep working; only `BlockMeta.tab` and
  `DetailTabId` were updated.
- **Per-block edit dialogs.** Each card on the detail page (Description,
  Links, Capabilities, Processes, Rules, NFR, Risks) now exposes its
  own small `Edit` button that opens a focused modal — the analyst
  can fix one block without scrolling through the full Edit form. The
  modal reuses `ComponentForm` with a new `focusBlock` prop that
  hides every other section and the Basic Information header. The
  modal fetches a fresh copy of the component on open (sha-aware), the
  form saves through the existing PUT endpoint with the rest of the
  component carried over from `initialData`, and the parent detail
  page re-fetches on success so the new state shows up without a
  navigation. Full Edit (the `Edit` button in the page header) still
  works for identity-level fields and bulk edits.

### Fixed (more v2 fallout cleanup)

- **Confluence page renderer rewritten for `links[]`.** Every component
  published to Confluence had three separate tables — Interfaces,
  Relationships, Inputs & Outputs — driven by the legacy arrays. After
  Phase 1 + 2 those arrays read empty post-migration, so the
  Confluence page lost half its content on every re-publish. Replaced
  with a single **Links** table (role / protocol / target / name /
  description) backed by `component.links[]`. `RELATIONSHIP_LABELS` +
  `DATA_KIND_LABELS` imports retired.
- **Rules import context uses `links[]`.** The AI prompt that feeds the
  Pass-1 rules-import classifier was assembling its component
  fingerprint from `c.interfaces`, `c.data.inputs` and `c.data.outputs`.
  All three are dropped on read now, so the model saw empty fields and
  classified poorly. Replaced with a single "Links" line listing every
  edge with role + protocol + target + optional name.
- **Component form / detail page visibility flags consolidated.** The
  legacy `technical.interfaces` and `business.data` block flags pointed
  at cards that no longer exist. `BLOCK_METAS` keeps only the unified
  `technical.relationships` row (label renamed to **Links**) plus the
  surviving Business cards (Capabilities, Processes). The TypeScript
  `interfaces?` and `data?` keys stay on `UIBlocksConfig` so existing
  `config.yaml` entries still validate; they are simply ignored.
- **Hero context block description refreshed.** Settings UI now says
  "Auto-rendered mermaid combining every link from this component to
  its peers" instead of the old inputs / outputs / owned data wording.

### Deleted

- `src/app/api/components/[id]/inbound-interfaces/route.ts`
- `src/app/api/components/[id]/inbound-relationships/route.ts`
- `src/components/MultiComponentPicker.tsx`
  (Both inbound routes returned empty after the migration; the picker
  was used only by the v1 consumers field on `data.outputs`.)

### Fixed

- **Blast Radius scan ported to `links[]`.** Phase 1 + 2 retired
  `interfaces[]`, `relationships[]` and `data{}` but the blast-radius
  computation was still iterating `comp.relationships`, so every
  component's BlastRadius tab showed "0 impacted" after the refactor.
  Reverse index now scans `links[]`; severity is derived from
  `LinkRole` (calls / reads-from / writes-to / part-of → HIGH;
  contains → MEDIUM; serves → LOW). The detail dialog renders the
  `via` chip from `LINK_ROLE_LABELS` and shows the link protocol
  alongside.

### Changed

- **Draw.io export consolidates to one dialog.** The standalone
  `/export` page and the `Download Draw.io Library` button on the
  catalog header did the same thing (hit `GET /api/export/drawio`).
  Merged into a single `DrawioLibraryDialog` mounted on the
  **Diagrams** page header and on the component **Documentation**
  tab. The `Export` top-nav entry and the catalog header button are
  removed; `/export` route is deleted. One copy of the instructions
  (paired with the download button) lives inside the dialog.

### Refactor — Phase 2: `data{}` collapses into `links[]`

The final step of the v2 schema refactor. Every input / output now
lives as a link with role `reads-from` / `writes-to`; `data.owns` is
dropped entirely; the 16-value `DataKind` ontology is gone.

- **Migration rules** (`migrateToLinksV2` in `src/lib/github.ts`):
  - `data.inputs[name=X, source=B, purpose=P]` → `links[reads-from B, name=X, description=P]`.
  - `data.outputs[name=X, consumers=[B,C], purpose=P]` → two links: `[writes-to B, name=X]` and `[writes-to C, name=X]`.
  - `data.owns` → **dropped** (no edge target; source-of-truth semantics retire).
  - DataKind, source-of-truth marker, owns metadata — **not preserved**.
  - Orphan inputs (no source) and outputs without consumers are dropped.
- **Mirror pair extended:** `reads-from ↔ writes-to` added to `LINK_ROLE_INVERSE`. Consistency check matches mirrors on `(target, role, protocol, name)` so a data flow declared from both sides collapses to one edge, and a mismatched name surfaces as a missing-mirror finding.
- **UI dropped wholesale:**
  - Form: the entire "Inputs / Outputs / Owns" section is gone — every flow is a Link row now.
  - Detail page: "Inputs & Outputs" card and "Data referenced by other components" card both removed; the Links card surfaces inbound flow via inverted role labels (`reads-from` ↔ `writes-to`, `Read by` / `Written to by`).
  - Architecture overview: `Data flow` toggle dropped — `reads-from` / `writes-to` render under the Relationships toggle alongside the other structural roles.
  - Consistency Check: data category gone — one `Links` category covers every mirror check. Fix kinds `addOutput`, `addInput`, `addOutputConsumer`, `setInputSource` removed; only `addLink` remains.
  - Catalog Export: per-component Data flow block removed; Coverage matrix Data column dropped; cross-cutting external-target scan reads `links[]` exclusively.
  - Hero context diagram: simplified to a single ring of inbound/outbound links labelled by `name` or `protocol` or `role`. No more inputs / outputs / owns groupings.
- **Backbone cleanup:**
  - `GET /api/components/[id]/inbound-data` route deleted.
  - `buildIOMermaid` + `buildInterfacesMermaid` removed from `component-mermaid.ts`.
  - `DATA_KIND_*` constants stay in `constants.ts` for legacy YAML parsing in the Import dialog (deprecated; not surfaced in any UI).
  - Component type still carries `data?: ComponentData` as a `@deprecated` field so pre-v2 YAML still type-checks; `normaliseForSave` strips it on every write.

### Refactor — Phase 1: `links[]` replaces `interfaces[]` + `relationships[]`

The component schema gains a single edge primitive: `ComponentLink` with
six roles (`calls`, `serves`, `part-of`, `contains`, `reads-from`,
`writes-to`) and an optional `protocol`. The legacy `interfaces[]` and
`relationships[]` arrays migrate on read, get dropped from disk on
next save, and disappear from the UI entirely.

- **`schema_version: 2`** on every component as the migration marker.
  Read of v1 YAML auto-populates `links[]` from the old arrays; first
  save writes v2 and strips the legacy fields.
- **Migration rules** in `src/lib/github.ts` (`migrateToLinksV2`):
  `interfaces[provides]` → `links[serves]`,
  `interfaces[consumes]` → `links[calls]`,
  `relationships[parent-of]` → `links[contains]`,
  `relationships[child-of]` → `links[part-of]`,
  `relationships[depends-on / communicates-with / fallback]` → `links[calls]` (description preserves the legacy nuance),
  `relationships[reads-from]` → `links[reads-from]`,
  `relationships[writes-to]` → `links[writes-to]`.
  Dedup on `(target, role, protocol)` so a partial migration cannot
  duplicate entries.
- **Form** (`ComponentForm.tsx`): the separate "Interfaces" and
  "Relationships" sections collapse into a single **Links** card.
  Each row picks target (typeahead picker), role (6-value select),
  optional protocol, plus name + description.
- **Detail page** (`/component/[id]`): one **Links** card replaces the
  Interfaces card + Inbound interfaces card + Relationships card +
  Inbound relationships card. Outbound + inverted inbound merge into
  one list via `combinedLinks`; mirror pairs (calls↔serves,
  part-of↔contains) dedup so the analyst sees the edge once.
- **Inbound endpoint**: new `GET /api/components/[id]/inbound-links`
  replaces inbound-interfaces and inbound-relationships. Single scan
  over every other component's `links[]` looking for `target === id`.
- **Consistency Check**: categories collapse from {relationships,
  interfaces, data} to {links, data}. Mirror rule:
  `calls ↔ serves`, `part-of ↔ contains`. `reads-from` / `writes-to`
  stay directional (passive target). Fix kind `addLink` replaces
  `addRelationship` + `addInterface`.
- **Architecture overview**: edge collection iterates `links[]` and
  classifies by role — calls / serves render as the "Interfaces"
  edge family, the other four as "Relationships" edge family. Mirror
  pairs normalised so each architectural edge appears once.
- **Catalog Export**: per-component "Interfaces" + "Outbound
  relationships" sections merge into one "Links" section; inbound
  block now lists rows from `links[]` with inverse role labels.
- **Maturity scoring**: two fields (`Interfaces`, `Relationships`)
  collapse to one (`Links (relationships & interfaces)`). Existing
  totals adjust automatically.

`data{}` (inputs / outputs / owns) is intentionally **untouched**
in this phase — that's Phase 2.

### Added

- **Data Model Registry integration (read-only).** Components of type `table` can be linked to an entity in an external REST metadata service via a new `data_model.entity` field. The edit form gains a "Data model registry link" card and the detail page renders attributes + relationships fetched live from the registry — the catalog never copies the registry data into YAML so the registry stays the single source of truth. One-way pull only: arch-tool never writes back. Generic across vendors — the base URL, API path prefix, entity endpoint and relationships endpoint are all configurable so any standards-compliant REST metadata service fits.
- **Two auth modes for the registry, mirroring the LLM gateway adapter.** Static bearer token (`DATA_MODEL_REGISTRY_TOKEN`) for the quick-start path; OAuth 2.0 client_credentials (`DATA_MODEL_REGISTRY_OAUTH_*`) for production deployments behind an identity provider. The OAuth provider class is shared with the LLM adapter — token caching, proactive refresh and 401-driven invalidate-and-retry already work.
- **Data Model Registry healthcheck row in Settings.** Four-step probe (DNS → request → response → classify) identical to the LLM / Git / Confluence rows. When OAuth mode is on, the trace splits into "Phase: Token" + "Phase: Registry" so an operator can pinpoint whether the IdP, the credentials, the scope/audience binding, or the registry endpoint itself is at fault.

### Environment variables

**Added (all optional, drop-in safe defaults — existing `.env.local` works unchanged):**

| Variable | Default | When set | Purpose |
|---|---|---|---|
| `DATA_MODEL_REGISTRY_BASE_URL` | (unset) | always | Enables the integration. Leave empty to disable. |
| `DATA_MODEL_REGISTRY_API_PATH` | `""` | optional | Path prefix between base URL and the endpoint paths. |
| `DATA_MODEL_REGISTRY_ENTITY_PATH` | `/dataModel/version` | optional | Endpoint that returns `{ entity, attributes, version, zone }`. |
| `DATA_MODEL_REGISTRY_RELATIONSHIPS_PATH` | `/relationships` | optional | Endpoint that returns `{ relationships: [{parent, child, type}] }`. |
| `DATA_MODEL_REGISTRY_ZONE` | `PRD` | optional | Value passed as the `zone` query parameter on entity lookups. |
| `DATA_MODEL_REGISTRY_AUTH` | `bearer` | optional | `bearer` (static token) or `oauth` (client_credentials). |
| `DATA_MODEL_REGISTRY_TOKEN` | (unset) | when `AUTH=bearer` | Static bearer token. |
| `DATA_MODEL_REGISTRY_OAUTH_TOKEN_URL` | (unset) | when `AUTH=oauth` | OAuth token endpoint. |
| `DATA_MODEL_REGISTRY_OAUTH_CLIENT_ID` | (unset) | when `AUTH=oauth` | OAuth client id. |
| `DATA_MODEL_REGISTRY_OAUTH_CLIENT_SECRET` | (unset) | when `AUTH=oauth` | OAuth client secret. |
| `DATA_MODEL_REGISTRY_OAUTH_SCOPE` | (unset) | when IdP needs scope | Pass-through to the token request. |
| `DATA_MODEL_REGISTRY_OAUTH_AUDIENCE` | (unset) | when IdP needs audience | Pass-through to the token request. |

**Changed / Removed:** none.

- **Two extra component types: `service` and `table`.** `service` sits next to `microservice` for cases where the team distinguishes "a service" from "a microservice" (or where the analyst has not committed to either pattern yet). `table` sits next to `database` for catalogs that model individual database tables / collections / entities as first-class components instead of folding them into the parent database. Both ship with icons (`ServerCog`, `Table`), distinct colours (cyan-600 for service, amber-600 for table), and drawio styles + sizes so they render cleanly on the diagram builder and the catalog cards.
- **Generic `component` type as the new default.** New components default to type `Component` (a neutral catch-all) instead of `microservice` so an analyst who has not yet decided what shape the thing is can still create it without picking a specific architecture archetype. Existing components keep their type unchanged. Listed first in the type picker, paired with a neutral indigo style on diagrams.
- **Component id auto-generated from the name.** Only the **Name** field is required on the new-component form. The id is slugified from the name on save (lowercase, dashes for spaces, alphanumerics + dash / underscore only). An "Advanced — customize component id" expander lets the analyst override the slug. Edit mode shows the id as read-only because renaming the YAML file would invalidate every link to the component.
- **Unified `description.description` field.** The Description card on the form and the detail page now uses one textarea instead of two (Technical + Business). Existing components that store split `description.technical` / `description.business` are merged into the unified field at read time via `migrateComponent`, so old YAML keeps loading unchanged on disk. The next save persists only the unified field and drops the legacy ones; components that have never been re-saved still render correctly by falling back to the legacy fields in the detail view and in the catalog search.
- **Pull-smart now patches `description.description`.** The Confluence pull-smart flow recognises the unified field as a primary patch target. Legacy `description.technical` / `description.business` patches still work for Confluence pages whose structure has not been re-published.
- **Import component from YAML.** New `Import` button on the catalog header opens a paste-and-import dialog: the analyst pastes a single component as YAML (generated externally — by their LLM of choice, exported from another catalog, or hand-authored), an inline `Validate` runs the same schema checker the server uses, and `Import` writes the YAML through the existing git provider. Validation surfaces both errors (block the import) and warnings (unknown fields, legacy `business_capabilities`, `data_model` on a non-table type — import still proceeds). On id collision the server auto-appends `-2`, `-3`, … up to `-99` and the response carries the final id, so the redirect lands on the actual saved component. After save the user is taken to `/component/<id>/edit` to immediately tweak the imported entry. Only `name` is required; `id` is auto-slugified from the name when omitted.
- **Interface target — typeahead picker with optional catalog link.** The Interfaces editor on the component form replaces the plain text Target input with a typeahead that suggests existing components as you type (id and name match, arrow keys + Enter, click-to-pick), but still accepts free text on Enter / blur for external systems and partners not modelled in the catalog. The catalog list is fetched once and shared across all picker instances in the form. A small `linked` badge appears next to the input when the current value matches a known component id, so the analyst can tell at a glance whether the target will resolve.
- **Interface targets render as clickable links on the detail page.** When `interfaces[].target` matches a component id, the Interfaces card on `/component/<id>` renders the target with its type icon and a link straight to that component. Free-form labels render unchanged (plain monospace text with a tooltip explaining it's an external label).
- **Referenced by interfaces from … (backlinks).** A new card on the Technical tab lists every other component whose `interfaces[].target` points at the current one. Each entry shows the source component (name + type icon), the original direction (`provides` / `consumes` from the source's perspective), the connector type, and the interface description. Drives discoverability for "who's actually talking to me" without needing to scan the whole catalog. Backed by a new `GET /api/components/<id>/inbound-interfaces` endpoint that runs one catalog scan per request — gated by the same Interfaces visibility flag as the outbound list so the two halves stay together when an admin hides Interfaces in Settings.
- **Relationships pick from the same typeahead picker.** The relationship Target field in the component form now uses the same typeahead picker as interfaces, replacing the static `<Select>` dropdown. The dropdown is always current (catalog is fetched per form mount), shows the component type icon alongside the name and id, and still accepts free text on Tab / Enter for forward references to components not yet in the catalog.
- **Referenced by relationships from … (relationships backlinks).** Mirrors the interfaces backlinks: a card on the Technical tab lists every other component whose `relationships[].target` points at the current one. Each entry carries the source name + type icon, the relationship label from the source's perspective (e.g. `depends-on`), the connector, and the description. Backed by `GET /api/components/<id>/inbound-relationships`; gated by the Relationships visibility flag.
- **Outbound relationships flag broken targets.** The Relationships card on the detail page resolves each target against the live catalog. Matched targets render as a clickable row with the target's type icon and name. Unmatched targets render as a non-link block with the raw id and a red `missing` badge, so the analyst can spot stale references at a glance instead of clicking through to a 404.
- **New `schema` component type.** 20th type, sits next to `table` in the picker. Pink-on-magenta palette with a dashed border (renders distinct from regular tables in the diagram builder + drawio export), uses the `Braces` icon. Use it for JSON / Avro / Protobuf message contracts, OpenAPI / GraphQL schemas, DB-schema views — anything that describes *shape* rather than runtime storage.
- **Interface `name` field.** `interfaces[].name` is a new optional string for a short human label — "Orders API", "Stock checker", "Inventory snapshot". Surfaces on the detail page as the primary label with the description as muted context; pops up in the inbound-interfaces backlinks too. Older interfaces with only `description` keep the description as the primary label, so no on-disk migration is needed. The mermaid Visualize panels prefer name over connector type for edge labels.
- **New `data` connector type.** `data` joins `rest / grpc / async / db / file / human / info / link` as the 9th connector / interface type. Pink double-arrow style (mirrors the `schema` component palette) — for data-flow edges where a `data` interface is the right metaphor but `db` or `async` is misleading (e.g. parquet drop, snapshot transfer, ETL pipe). Wired into the form picker, the validator, the drawio library export, and the diagrams/builder edge palette.
- **Hero context diagram now includes interfaces and resolves names.** The Overview "Component context" mermaid renderer was missing the interfaces section entirely and was using raw component ids in relationship labels. Both fixed: interfaces render direction-aware between the component and its peers, all peer nodes display the human-readable component name when the target id matches a known component (falling back to the id for unmatched/external strings). The other Visualize panels (Interfaces, Relationships) take the same id→name lookup, so node labels are consistent across the detail page.
- **Data input `source` is a typeahead picker — and gains backlinks.** The "Source" field on `data.inputs` rows in the form is now a `ComponentTargetPicker` (same UX as interface targets and relationship targets): suggestions filter as the analyst types, picking from the dropdown stores the canonical component id, and free text is still accepted for sources that are not modelled in the catalog yet. On the detail page the source renders as a clickable row with the upstream component's type icon and name; a red `missing` badge surfaces stale references inline.
- **Data output `consumers` is a multi-pick chip editor.** Replaces the old comma-separated text input. Each consumer appears as a removable chip (with type icon + human name when it resolves to a known component); a single picker below adds the next one — pick from the dropdown to auto-add, or type and press Enter (or click Add) to commit free text. On the detail page consumers render as a row of links with the same TypeIcon + name treatment as the source field.
- **Data backlinks card on the Business tab.** Two grouped lists, both backed by the new `GET /api/components/<id>/inbound-data` endpoint: (1) *Downstream consumers* — components that named this one as `inputs[].source`, with the DataItem they receive; (2) *Upstream emitters* — components that named this one in `outputs[].consumers`, with the DataItem they push. Gated by the same Inputs & Outputs visibility flag as the outbound IO card.
- **Catalog view preferences persist across reloads.** Search query, type / status / owner / tag filters, view mode (grid / tiles / list) and the group-by-type toggle are now stored per-browser in `localStorage` under the `arch-tool:catalog:` prefix. Open a component, hit Back, refresh the tab, close and re-open the browser — the catalog comes back the way the analyst left it instead of resetting to grid + no filters every time. Backed by a new `useStoredState` hook in `src/lib/use-stored-state.ts` (defaults on SSR, hydrates on mount, persists on each change) — reusable from any client component that needs the same pattern.
- **Inbound relationships merge into the Relationships card.** Removed the standalone "Referenced by relationships from" card. Inbound relationships now appear inline in the regular Relationships section with their *inverse* label — so on a parent component's detail page, a child that declared `child-of: parent` shows up as **"Parent of: child"** alongside any explicit outbound entries. Driven by a new `INVERSE_RELATIONSHIP_LABELS` map in `src/lib/constants.ts` (`parent-of ↔ child-of`, `depends-on → required-by`, `reads-from → read-by`, `writes-to → written-to-by`, `fallback → has-fallback`, `communicates-with` symmetric). Dedupe key `displayLabel + target` so an edge that BOTH sides legitimately declared (e.g. A:parent-of:B + B:child-of:A) collapses to a single row with the outbound side winning. Inverse rows carry a hover tooltip "Declared on X — edit it there" so the analyst knows where to go to change the underlying YAML.
- **Hero context diagram includes inbound relationships.** The Overview "Component context" mermaid and the per-section Relationships visualizer both now receive the merged outbound + inverted-inbound list, so a parent component that has no explicit `parent-of` declarations but is targeted by `child-of` from several children draws those edges (with the inverse label) instead of looking falsely empty.
- **Fix: hydration error on the detail page.** The Status row in the Details card wrapped `<StatusBadge>` (which renders a `<div>` via shadcn `Badge`) inside a `<p>`. That is invalid HTML, and Next dev mode threw a hydration mismatch every time the page loaded. Switched the wrapper to a `<div>` with a top margin to keep the visual rhythm.
- **Fix: catalog preferences sometimes read as "still resetting".** The first version of `useStoredState` loaded the persisted value in a post-mount `useEffect`, which meant the very first render always showed the default and snapped to the stored value one paint later — and the in-between frame read as "the page didn't remember". Rewritten with a synchronous `useState` initialiser that reads `localStorage` on the client's first render (and falls back to the supplied default on the server). The persisted filters / view mode / grouping now appear on the first paint, with no flash, when the user navigates back to `/`.
- **Catalog Consistency Check.** New `Consistency check` button on the catalog header runs a deterministic backlink audit across the whole repo. Scans every component, surfaces one row per missing backlink with a per-row `Fix` button (and a bulk `Apply all`). Categories: **Relationships** (parent-of ↔ child-of, communicates-with ↔ communicates-with — the other relationship types stay directional by design), **Interfaces** (provides ↔ consumes on the same connector type and target — mirror interface inherits the original's name / description), **Data flow** (inputs[].source ↔ outputs[].consumers — matching DataItem name; auto-adds the missing output / input / consumer / source). Each fix is one atomic patch to one target YAML, committed through the existing git provider with optimistic concurrency on the sha. The apply endpoint re-runs the scan on every call and looks up the issue by stable id, so a double-click or a race against another path returns 404 idempotently instead of double-applying. Backed by `src/lib/consistency.ts` (pure detection + fix), `GET /api/admin/consistency-check` and `POST /api/admin/consistency-check/apply`.
- **Architecture overview — one-click full-catalog diagram.** New `Architecture overview` button on the catalog header opens a near-fullscreen modal with a mermaid flowchart of every component and the edges between them. Four toggles select what to show — **Relationships** (solid arrows, inverse pairs deduped so `A:parent-of:B + B:child-of:A` collapse to one), **Interfaces** (dotted arrows, normalised consumer → provider so `provides` + `consumes` mirrors collapse), **Data flow** (thick arrows, `inputs[].source` and `outputs[].consumers` deduped into source → consumer edges), **Group by type** (wraps each type's nodes in a labelled subgraph). Nodes are coloured by `TYPE_COLORS` — same palette as the catalog cards and the drawio export. Toggle preferences persist per browser via `useStoredState`. `Copy Mermaid` in the footer lifts the chart source for pasting into mermaid.live or any markdown doc. Pure string producer in `src/lib/architecture-mermaid.ts` — no new API surface; the dialog reuses `GET /api/components`.
- **Component Type Model help dialog refreshed for the current 20-type schema.** The "?" dialog on the catalog header was still describing the old 16-type set and listed Database as a standalone leaf. Restructured into three sections: **Org hierarchy** (Boundary → Context → {Application, Microservice, Service} → Module — `service` slots in next to microservice as the more permissive shape for "a service that isn't strictly a microservice"); **Data hierarchy** (Database → Schema → Table, where Schema is the database namespace / contract sense — JSON / Avro / Protobuf / OpenAPI also fit as a standalone Schema); **Standalone** (Component as the catch-all default, plus Frontend / Cache / Queue / Data Pipeline / Batch Job / Storage / Gateway / External / Platform / Library). The subtitle now reads "20 component types" and each section carries a one-paragraph explanation of what its tree means.
- **Component Data Model reference doc.** New canonical schema reference in `docs/COMPONENT_MODEL.md` (660 lines) designed as a self-contained system prompt for any LLM that authors / migrates / audits component YAML. TypeScript types for every shape, enum tables (20 types, 9 connectors, 16 data kinds, all role enums), required / default / validation rules, mirror & inverse semantics with explicit guidance not to defensively declare both sides, full backward-compat migration table, an annotated YAML example, and a pre-emit checklist for code generators.
- **Catalog Export (LLM-friendly).** New `Export for LLM` button on the catalog header opens a near-fullscreen modal containing the entire catalog rendered as a single markdown document with **every field of every component shown — including the empty ones**. Empty fields are flagged explicitly with `❌ NOT SET` / `❌ NONE DEFINED` / `❌ NONE` so a model reading the export can answer "where are the gaps?" at the same time as "what do we have?". Structure: header → at-a-glance summary (counts by type / status / owner, average maturity, repo-wide gap stats per field) → coverage matrix (one-line-per-component overview) → cross-cutting index (capabilities, processes, external / unknown targets referenced) → per-component detail block (identity + description + interfaces + outbound relationships + inbound backlinks + capabilities + processes + rules + data flow + NFR + diagram + risks + missing-field summary). Footer offers `Copy all`, `Download .md` and a `Raw URL` link that hits `GET /api/admin/export-catalog` so the same payload is reachable from `curl` or any non-UI pipeline. Pure string producer in `src/lib/catalog-export.ts`.

### Fixed

- **Operational logs now actually populate `app.YYYY-MM-DD.jsonl`.** v0.5.0 shipped the file sink and the Admin console's Operational logs tab, but most API routes were still emitting their errors through `console.error`/`console.warn` (which only lands on stdout) instead of `getLogger()`. As a result, the file sink was being written for LLM calls and admin actions only, and the Operational tab stayed empty on file-sink deployments. This release replaces every server-side `console.*` in `src/lib/*` and every API route with `getLogger()` equivalents, and wraps every route handler in `withRouteContext` so an `info` entry per mutating request and a `debug` entry per `GET` are emitted automatically. The `app` stream now reflects real traffic.

## [0.5.0] — 2026-05-25

Observability + code release. Two themes:

1. **Structured logging + Admin console.** Every server-side log line is a JSON object; per-day per-stream files capture operational events, full LLM call traces and the admin audit trail. A new `/admin` route (gated by the existing `SITE_PASSWORD`) browses all three with filters and search. The LLM tab exports selected calls as OpenAI fine-tuning JSONL with one click — built for the corp use-case where a non-vanilla LLM behind a gateway needs prompt tuning.

2. **Rules-import from source code.** Third tab in the import wizard alongside PDF and Confluence — paste source code or upload a single file (.java / .cs / .py / .js / .ts / .go / .sql / .cob / .pli / ...). The two-pass AI pipeline reuses the same Pass 1 relevance filter and Pass 2 structured extractor, with code-aware prompts that ignore plumbing and translate code into business terms.

All features are additive — your existing `.env.local` keeps working unchanged. Four new optional environment variables are documented below.

### Added

- **Structured JSON logging.** Every server-side log line is a JSON object with `ts`, `level`, `requestId`, `user`, `route`, `msg` and (optional) `meta`. Three streams: operational entries (`app.*.jsonl`), LLM call traces (`llm.*.jsonl`), admin audit trail (`admin-actions.*.jsonl`). Per-day rotation by filename. Configurable level (`LOG_LEVEL`) and sink (`LOG_SINK=stdout|file|both`) with file output rooted at `LOG_PATH`.
- **Full LLM call traces.** Every `complete()` call writes a log entry with provider, model, full prompt + response (when `LLM_LOG_FULL=true`, default), latency, and ok/err. Designed for fine-tuning analysis — the Admin console exports selected entries as OpenAI fine-tuning JSONL (`{messages: [{role:"user", content:prompt}, {role:"assistant", content:response}]}`) ready to upload as the `purpose: "fine-tune"` input.
- **Admin console at `/admin`.** Every logged-in user (already gated by `SITE_PASSWORD`) can browse three tabs:
  - *LLM calls* — filter by user / route / provider / OK-or-failed / full-text; click any row to expand the full prompt + response side-by-side with copy buttons; multi-select + Export as fine-tuning JSONL or raw JSONL.
  - *Operational logs* — filter by level / user / route / search; click an entry to expand its `meta` block.
  - *Admin audit* — every privileged action: `storage.init`, `config.save`, `lock.acquire`, `lock.denied`, `lock.release`, `llm.export`.
- **Request correlation IDs.** Every request gets an `x-request-id` (mint a fresh UUID when the reverse proxy did not set one). All log lines from the same request share the id so a failing chain can be reconstructed end-to-end.
- **Front-end error reporter.** `window.onerror` + `unhandledrejection` ship to `/api/client-log`; entries land in `app.*.jsonl` with `meta.source: "client"` so the Admin console shows them alongside server logs. De-duplicated within a 5-second window so a render loop cannot flood the sink.
- **Secret redaction across the logger.** `Authorization` headers, `client_secret`, `access_token`, `id_token`, `refresh_token` and OpenAI/GitHub key patterns are masked to a short `prefix…****suffix` hint before any sink writes them. Applied to log messages, meta objects, and the body excerpts inside LLM trace entries.
- **Rules-import from source code.** A third tab in the import wizard — paste source code or upload a single file — sends it through the same two-pass pipeline as PDF/Confluence with a code-aware prompt. Pass 1 surfaces business-logic blocks while ignoring plumbing (logging, DI, HTTP routing, tests, getters/setters, imports); Pass 2 translates them into the existing `ComponentRule` schema, with formulas extracted as plain algebraic expressions, if/else mapped to Given/When/Then, and validators as constraints. Verbatim source excerpt is kept as `evidence`.
- **Language detection for code uploads.** Filename extension is mapped to a language slug (Java, Kotlin, C#, Python, JS/TS, Go, Rust, Ruby, PHP, Swift, C/C++, SQL, PL/SQL, COBOL, PL/I, Scala, Groovy, Lua, R, Perl, shell, PowerShell, Dart) and passed to the LLM as a hint; the user can override via a dropdown.

### Environment variables

**Added (all optional, drop-in safe defaults — existing `.env.local` works unchanged):**

| Variable | Default | When set | Purpose |
|---|---|---|---|
| `LOG_LEVEL` | `info` | always | `debug` / `info` / `warn` / `error` |
| `LOG_SINK` | `stdout` | always | `stdout` / `file` / `both` |
| `LOG_PATH` | `./logs` | when `LOG_SINK` is `file` or `both` | Absolute path of the JSONL log directory |
| `LLM_LOG_FULL` | `true` | always | `true` keeps full prompts+responses for fine-tuning analysis; `summary` keeps only metadata |

**Changed / Removed:** none.

## [0.4.0] — 2026-05-25

Shared-team release. Two themes:

1. **Filesystem storage backend** — third `GIT_PROVIDER` option that
   stores the catalog directly under a configured directory (local
   disk, network share, NAS mount) instead of pushing through a remote
   Git API. Same store layer as the other providers; switching is an
   env change + restart. History is kept as JSONL sidecars so the
   History tab still works without a Git remote.

2. **Hard edit lock for multi-user filesystem deployments** — one user
   at a time owns the edit form for a given component. The second user
   opens the page in read-only mode with a banner naming the current
   editor. TTL 10 minutes, heartbeat-renewed while the edit page is
   open; explicit "Release lock" button + auto-release on save and on
   navigate-away. Locks are filesystem-only; remote-Git providers
   continue to rely on optimistic concurrency at save time.

Plus an OAuth 2.0 client_credentials mode for the openai-compatible
LLM provider — enterprise gateways behind any identity provider
(Entra ID, Okta, Auth0, Keycloak, AWS Cognito, ...) now work
out-of-the-box; the token URL is explicit so no vendor is assumed.

All features are additive — no v0.3.0 deployment has to change anything.

### Added

- **Filesystem storage backend.** Third `GIT_PROVIDER` option (`filesystem`, also `fs` / `file`) stores the catalog directly under a configured directory — local disk, network share, NAS mount — instead of pushing through a remote Git API. Set `FS_STORAGE_PATH` to an absolute path. The store layer (components, diagrams, Confluence-link side-files) is identical to the Git-backed providers so the rest of arch-tool is unchanged. Atomic writes via temp file + rename. Optimistic concurrency uses a SHA-256 of the current file content as the opaque revision token; mismatch on save returns 409 and the UI offers the user a Reload / Cancel choice.
- **Hard edit lock for multi-user filesystem deployments.** When two analysts share a filesystem storage root, only one can hold the edit form for a given component at a time. The second user opens the page in read-only mode and sees a banner with the current editor's name and acquisition time. Lock TTL is 10 minutes, refreshed by a heartbeat every 5 minutes while the edit page is open; a successful save and an explicit "Release lock" button both free it immediately. The hash-based optimistic-concurrency check at the provider level remains the safety net for the few corner cases where a lock cannot be honoured (TTL expired mid-save). Locks are filesystem-only — remote Git providers continue to rely on optimistic concurrency at save time, as before.
- **Per-file JSONL history sidecar** under `_history/{path}.jsonl` on the filesystem backend. Each save / delete appends one entry (timestamp, user, message, action) so the History tab on the component detail page still works on filesystem deployments — no real Git remote needed for an audit trail.
- **`X-Forwarded-User` reader for multi-user deployments.** When a corporate reverse proxy authenticates the user upstream and injects an identity header, arch-tool reads it for edit-lock ownership and history sidecar entries. Header name is configurable via `USER_HEADER`. Falls back to `anonymous` when no header is present.
- **"Initialize storage" button in Settings.** When the filesystem healthcheck reports a missing sub-directory layout under a freshly-mounted storage root, the Settings page surfaces a one-click button that creates `components/`, `diagrams/`, `confluence-links/`, `_history/` and `_locks/` in one POST. No `mkdir` from the shell required.
- **Filesystem-shaped diagnostic probe.** `probe()` on the filesystem provider returns a four-step trace — resolve, access, contents, write-test — instead of DNS / request / response, so the operator can pinpoint exactly which check failed: path not found, not a directory, no read/write, missing sub-directories, write-test failed (disk full, quota, permissions).
- **OAuth 2.0 client_credentials authentication for the openai-compatible LLM provider.** Enterprise gateways that sit behind an identity provider can now be used as a drop-in for a static API key. Setting `LLM_OAUTH_TOKEN_URL` switches the adapter into OAuth mode; `LLM_API_KEY` is then ignored. The token URL is explicit so the adapter stays vendor-agnostic — Microsoft Entra ID, Okta, Auth0, Keycloak, AWS Cognito and self-hosted OpenID Connect IdPs all fit. Optional `LLM_OAUTH_SCOPE` and/or `LLM_OAUTH_AUDIENCE` are passed through to the token request. Tokens are cached in memory and refreshed proactively 5 minutes before expiry; concurrent callers share one in-flight refresh; 401 from the gateway invalidates the cache and retries once.
- **Two-phase diagnostic probe for OAuth.** In OAuth mode the Settings health check runs DNS / request / response / classify against the IdP token endpoint first, then again against the gateway with the freshly-minted bearer. The trace is rendered with a "Phase: Token" / "Phase: Gateway" heading so a verbose probe pinpoints whether the failure is in the IdP, the credential, the scope/audience binding, or the gateway itself. Bearer tokens never leave the server in the trace — `access_token`, `id_token` and `refresh_token` values in the token response body are masked before they enter the response excerpt, and the request body (which carries `client_secret`) is never echoed.

## [0.3.0] — 2026-05-21

Corporate-debugging release. Two themes:

1. **AI rules import.** A Rules & Calculations analyst can now feed the
   tool a PDF or a Confluence page and have the AI propose rule
   candidates pre-shaped for the existing schema. A two-pass pipeline
   keeps it practical on long documents — Pass 1 filters to passages
   relevant to the active component, Pass 2 extracts structured
   candidates. The analyst reviews, edits and selectively imports;
   duplicates are flagged and unchecked by default.

2. **Verbose connection diagnostics.** Health checks now describe what
   they are about to do (URL, endpoint, masked credential hint, scheme)
   and return a four-step probe trace (DNS → request → response →
   classify). Failures classify into nine specific categories —
   including a dedicated `tls` category that points at
   `NODE_EXTRA_CA_CERTS` for the common corporate case where curl
   works but Node does not trust the internal CA. The deepest
   `err.cause` is unwrapped so the trace shows the real Node code
   (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ECONNREFUSED`,
   `ERR_TLS_CERT_ALTNAME_INVALID`, etc.) instead of the generic
   "fetch failed".

Both features are additive — no v0.2.0 deployment has to change anything.

### Added

- **AI rules import from PDF or Confluence.** Rules & Calculations tab gains an "Import from documents" button that opens a wizard: choose a PDF (≤ 12 MB) or paste a Confluence page URL / page id, the server extracts text, then runs a two-pass AI analysis — Pass 1 filters the document down to passages relevant to the active component (skipped for documents under ~20K chars where it wastes more than it saves), Pass 2 emits structured rule candidates that match the existing `ComponentRule` schema (formula / Given-When-Then / constraint). Every candidate is editable (name, kind, summary, formula or G/W/T fields, description), shows a confidence badge, the source section, and a verbatim evidence quote; candidates the AI thinks duplicate an existing rule are flagged and unchecked by default. Import is append-only — selected candidates are merged onto the component and persisted through the existing PUT /api/components/[id] save flow, complete with sha optimistic concurrency. Hard cap at 320,000 input characters (~80K tokens, ~80 pages of text) — over-cap documents are rejected with a clear message before any LLM call.
- **Verbose connection diagnostics in Settings.** Health checks now return a sanitized connection self-description (provider, base URL, endpoint template, repo / space / model, auth scheme, credential hint with `prefix…****suffix` masking) plus a four-step probe trace (DNS → request → response → classify). Failed probes auto-expand and surface an error category (`tls`, `connect`, `auth-401`, `forbidden-403`, `not-found-404`, `rate-limit-429`, `server-5xx`, `dns`, `parse`, `http-other`) and a category-specific hint. The Response and Headers sections are inspectable in collapsible panels, so debugging an external integration no longer needs a separate curl session. Secrets are never returned in full from the server — `Authorization` and `x-api-key` headers are masked before they leave the route.
- **TLS vs connect classification on fetch failure.** When Node's `fetch()` fails, the probe now walks the `err.cause` chain and surfaces the real Node error code (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ECONNREFUSED`, `CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, etc.) instead of the generic "fetch failed". A dedicated `tls` category covers cert-chain failures with a hint pointing at `NODE_EXTRA_CA_CERTS` — the standard fix for corporate networks with an internal CA where curl works but Node does not.

## [0.2.0] — 2026-05-19

Multi-backend release. Every external integration the catalog touches —
LLM, Git, Confluence — now ships with two adapters and a clean env-var
switch between them, so the tool fits a corporate stack (Azure DevOps +
on-prem Confluence + internal LLM gateway) as cleanly as the original
home stack (GitHub + Atlassian Cloud + Anthropic direct). Plus a
team-wide Settings page, in-product health checks for every provider,
explicit rule ordering, and a Next.js 15 upgrade. No deployment on
v0.1.0 has to change anything — every new option defaults to the v0.1.0
behaviour.

### Added

- Pluggable LLM provider — choose Anthropic Claude (default) or any OpenAI-compatible gateway via `LLM_PROVIDER`. The OpenAI-compatible adapter works with OpenAI, Azure OpenAI, OpenRouter, Together, Groq, LiteLLM, Portkey, Cloudflare AI Gateway, Ollama, LM Studio, vllm, etc.
- Pluggable Git backend — choose GitHub (default) or Azure DevOps via `GIT_PROVIDER`. The ADO adapter supports both Azure DevOps Service and on-prem Server/TFS via `ADO_BASE_URL`, authenticated with a Personal Access Token.
- Pluggable Confluence edition — choose Cloud (default, v2 + Basic auth) or Data Center / Server (v1 + Bearer PAT) via `CONFLUENCE_EDITION`. Same publish, pull-smart and "open in Confluence" flows across editions.
- Optional `config.yaml` at the root of the data repo with `llm.model` to set the active model without a redeploy.
- **Reorder rules** — ChevronUp / ChevronDown buttons next to each rule in the edit form. Order persists in the YAML `rules[]` array so sequence-dependent rules (base premium → risk surcharge → fraud override) can be modelled explicitly.
- **Settings page (`/settings`)** — hide individual blocks on the component detail page (15 blocks across 8 tabs: Hero context diagram, Details, Descriptions, Risks, Interfaces, Relationships, NFR, Capabilities, Data Perspective, Processes, Rules tab, Blast Radius tab, Documentation tab, Diagrams tab, History tab). One config applies to every component for the whole team — saved in `ui.blocks` of `config.yaml` via the active Git provider. Tabs whose blocks are all hidden disappear from the tab strip.
- **Health checks in Settings** — per-provider "Test" buttons plus a "Run all" shortcut probe LLM (1-token completion), Git (lists `components/` tree) and Confluence (search for a non-existent title) and surface the active provider/edition, model, branch and round-trip latency.

### Upgrades

- Next.js 14.2.35 → 15.5.18. No app-level code changes were needed — the route handlers were already on the new async `params` signature.
- `@anthropic-ai/sdk` 0.80.0 → 0.91.1.
- `eslint-config-next` aligned with Next 15.
- TypeScript `target` bumped to `ES2017` (auto-applied by Next 15 for top-level `await`).
- Dependency vulnerabilities cut from 6 high / 10 moderate / 3 low down to 2 moderate (both transitive postcss inside Next.js — not exploitable in this codebase, no clean upstream fix).

### Changed

- `ANTHROPIC_API_KEY` is now required only when `LLM_PROVIDER=anthropic` (still the default). The OpenAI-compatible adapter uses `LLM_BASE_URL` + `LLM_API_KEY` instead.
- The store layer (`src/lib/github.ts`) now reads and writes through a provider abstraction (`src/lib/git/`) so the existing 12 API routes work identically against either backend.

## [0.1.0] — 2026-05-18

First public release. Free software under MIT.

### Catalog

- Component model with 16 types, status, owner, tags, three audience descriptions.
- Rich modelling: `capabilities` (with role: owner / contributor / consumer / indirect), `data` (inputs / outputs / owned data, kinds across Format / Business / Technical groups), `processes`, `rules` (formula / Given-When-Then / constraint), NFR fields, interfaces, relationships.
- Catalog views: grid / tile / list, group-by-type toggle, search and filter (type / status / owner / tags).
- Drawio export of the full component library as `mxlibrary` XML.

### Detail page

- 7-tab layout: Overview · Technical · Business · Rules & Calculations · Blast Radius · Documentation · Diagrams · History.
- Identity panel with type, status, owner, tags and a documentation maturity bar (13 fields scored).
- Hero "Component context" mermaid diagram combining inputs, outputs, owned data and direct relationships.
- Per-section "Visualize" toggles for Interfaces, Relationships, Capabilities and Inputs & Outputs.

### AI features

- Documentation Generator with three audiences (Technical / Business / Executive) and three doctypes (Detailed Solution / Audit Report / Security Report). Optional PDF / ERD / BPMN attachments enrich the prompt. Model: Claude Sonnet 4.
- Blast Radius analysis: reverse-graph BFS over relationships, severity classification, NFR gap detection, confidential-data flags. Plus one-click AI Impact Memo.
- Pull-smart: Claude scan of a Confluence page proposes per-field patches (scalar fields plus indexed `rules[N].field` paths) with confidence levels and evidence quotes. User approves per-patch, then committed to the data repo.

### Confluence integration

- Publish: renders structured Component Reference (At a glance · Capabilities · Interfaces · Relationships · I/O · Processes · Rules · NFR · Risks) as native Confluence tables and panel macros. Mermaid blocks stripped (no plugin assumed). Hierarchy mirrors the first capability — capability parent pages are lazy-created.
- Open in Confluence / Pull from Confluence / Publish to Confluence buttons all live on the Documentation tab.
- Page identification by side-file (`confluence-links/{id}.json` in the data repo) with title-based fallback if the side-file write fails.

### Diagrams

- WYSIWYG drawio builder with drag-and-drop palette of pre-styled component types and eight typed connectors (REST / gRPC / Async / DB / File / Human / Info / Link).
- Diagrams stored as `.drawio` XML in `diagrams/` in the data repo.
- Per-diagram preview rendered as mermaid (drawio → mermaid converter).
- Cross-link: each component's Diagrams tab lists every diagram that references it (matched by `arch_id`).

### Infrastructure

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Radix.
- Git as the only persistent store — no database.
- Password gate via `middleware.ts` (single-tenant).
- In-memory rate limiter (5 requests / minute / IP) on AI endpoints.
- Public architecture overview at `/architecture.html`.

### Project

- MIT license.
- Architecture-questions checklist and 6-phase port plan for moving the app into a corporate environment.
- Best-effort maintenance model documented in README.

[Unreleased]: https://github.com/jazzwedz/arch-tool/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.5.0
[0.4.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.4.0
[0.3.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.3.0
[0.2.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.2.0
[0.1.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.1.0
