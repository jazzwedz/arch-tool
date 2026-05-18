# Team Repository

AI-powered architecture catalog for a single team — components, capabilities, data flows, business rules and Confluence sync, all kept as YAML in a Git repo.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/jazzwedz/arch-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/jazzwedz/arch-tool/actions/workflows/ci.yml)
![Status: best-effort](https://img.shields.io/badge/status-best--effort-blue)

---

## What is this?

A lightweight architecture catalog for **one team** (DEVs + BAs together), not an enterprise EA tool. Capture every component your team owns — its API surface, its data, its capabilities, its business rules, its risks — and turn that into living documentation:

- Browse the catalog like a service portal.
- Generate audience-tailored docs (Technical / Business / Executive) with Claude.
- Publish them to Confluence as proper pages with tables and panels — and pull edits back into the catalog via an AI patch flow.
- Analyse blast radius: pick a component and see what would break if it failed.
- Draw drawio diagrams that use your catalog as a palette.

Live demo: <https://arch-tool-jaso.up.railway.app/> (password-protected single-tenant demo).
Architecture overview: <https://arch-tool-jaso.up.railway.app/architecture.html>

## Features

- **Component catalog** — 16 component types, status, owner, tags, three audience descriptions.
- **Rich modelling** — `capabilities` (with role: Owner / Contributor / Consumer / Indirect), `data` (inputs / outputs / owned, 16 kinds across Format / Business / Technical), `processes`, `rules` (formula / Given-When-Then / constraint), NFR, interfaces, relationships.
- **AI documentation generation** — Claude Sonnet 4. Audience-tailored or doctype (Audit / Security / Detailed Solution). Optional PDF / ERD / BPMN attachments enrich the prompt.
- **Bidirectional Confluence sync** — publish renders structured tables and coloured panel macros; pull-smart compares page edits against the YAML and proposes per-field patches with confidence + evidence.
- **Blast Radius analysis** — reverse-graph BFS over relationships; severity per relationship type; NFR gaps and confidential-data flags; one-click AI Impact Memo.
- **WYSIWYG diagram builder** — drag pre-styled components onto a drawio canvas; 8 typed connectors; save to repo as `.drawio` XML.
- **Hero context diagram** — auto-rendered mermaid combining inputs / outputs / owned data / relationships per component.
- **Documentation maturity score** — 13-field score with banded labels (Skeletal / Drafted / Solid / Complete).

## Quickstart

Prerequisites: Node.js 20+, an empty GitHub repository for your catalog data, an Anthropic API key, optionally a Confluence Cloud account.

```bash
git clone https://github.com/jazzwedz/arch-tool.git
cd arch-tool
npm install
cp .env.local.example .env.local
# edit .env.local with your tokens (see "Configuration" below)
npm run dev
# open http://localhost:3000
```

The catalog itself lives in a **separate Git repo** (the `arch-data` pattern). Point the app at any empty Git repo you own — components, diagrams and Confluence link side-files are committed there.

## Configuration

All configuration via environment variables (`.env.local` for dev, your platform's secret store for prod). See [`.env.local.example`](.env.local.example) for the full list.

### Required

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT with Contents: Read/Write on your `arch-data` repo |
| `GITHUB_OWNER` | GitHub user/org that owns the data repo |
| `GITHUB_REPO` | Name of the data repo (defaults to `arch-data`) |
| `GITHUB_BRANCH` | Branch to commit into (defaults to `main`) |
| `ANTHROPIC_API_KEY` | Anthropic key for Claude (Generate, Blast Radius memo, Pull-smart) |
| `SITE_PASSWORD` | Shared password gate (basic single-user auth) |

### Optional — Confluence integration

If unset, Publish / Pull / Open in Confluence buttons are hidden.

| Variable | Purpose |
|---|---|
| `CONFLUENCE_BASE_URL` | `https://<your-site>.atlassian.net` |
| `CONFLUENCE_EMAIL` | Atlassian account email |
| `CONFLUENCE_API_TOKEN` | API token from `id.atlassian.com/manage-profile/security/api-tokens` |
| `CONFLUENCE_SPACE_ID` | Numeric ID of the target space |
| `CONFLUENCE_SPACE_KEY` | Space key (used for nicer URLs) |
| `ARCH_TOOL_PUBLIC_URL` | Public URL of your deployment (linked from Confluence pages) |

## Deployment

The app is a standard Next.js 14 deployment — anything that runs Node.js works.

- **Docker** — see [`Dockerfile`](Dockerfile):

  ```bash
  docker build -t team-repository .
  docker run --rm -p 3000:3000 --env-file .env.local team-repository
  ```

- **Railway** (used by the demo) — push to GitHub, set env vars in the dashboard, auto-deploy on `main`.

  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/jazzwedz/arch-tool)

- **Vercel** — works out of the box for Next.js.

  [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jazzwedz/arch-tool)

The catalog uses GitHub as storage, so there is no database to run.

## Architecture

A single-page visual overview lives at `/architecture.html` in the running app, and statically at [`public/architecture.html`](public/architecture.html) in this repo. It covers:

- Tech stack (7 layers)
- App map (routes + API endpoints + integrations)
- Component model (every YAML field)
- The 7 tabs on the detail page
- Feature highlights
- Confluence integration flow
- Deployment env vars
- Roadmap to port the app into a corporate environment

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Radix · lucide-react · mermaid · marked · react-markdown · octokit · `@anthropic-ai/sdk` · js-yaml. No database — Git is the catalog.

## Maintenance & contributions

This project is maintained on a **best-effort basis** by one person, in spare time. Expect:

- Pull requests reviewed when there is time — typically within a couple of weeks.
- Issues triaged as time allows. Please search before opening a new one.
- No promised release cadence — releases happen when features stabilise.
- No bug bounty.

Contributions are welcome, especially:

- Bug fixes with a clear reproduction
- Documentation improvements
- New storage adapters (GitLab, Bitbucket, internal Git providers)
- New LLM adapters (Azure OpenAI, Bedrock, local models via Ollama)

By contributing you certify your work under the project's [MIT License](LICENSE).

Security issues — please follow [SECURITY.md](SECURITY.md) (do not open public issues).

## License

[MIT](LICENSE) — do whatever, just keep the copyright notice.
