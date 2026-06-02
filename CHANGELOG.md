# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project loosely follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/jazzwedz/arch-tool/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.4.0
[0.3.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.3.0
[0.2.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.2.0
[0.1.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.1.0
