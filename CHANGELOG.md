# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project loosely follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/jazzwedz/arch-tool/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jazzwedz/arch-tool/releases/tag/v0.1.0
