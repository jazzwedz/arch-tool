// DSD artifact store — generated Detailed Solution Descriptions are
// persisted to the data repo as markdown files with a YAML front-matter
// metadata block, under dsd/<solutionId>/<artifactId>.md. Each is one
// commit, so the DSD library is versioned and auditable like everything
// else in arch-tool. Routed through the same GitProvider (getGit).

import yaml from "js-yaml"
import { getGit, GitNotFoundError } from "./git"
import { getLogger } from "./log"

export type DsdMode = "quick" | "team"

export interface DsdFeedback {
  /** Stable id so the coach can mark it consumed. */
  id?: string
  rating: "up" | "down"
  comment?: string
  /** Optional analyst-corrected version (gold training signal). */
  correctedText?: string
  at: string
  by?: string
  /** True once a coach proposal built from it was approved or rejected. */
  resolved?: boolean
}

export interface DsdArtifactMeta {
  id: string
  solutionId: string
  title: string
  mode: DsdMode
  model?: string
  createdAt: string
  /** team mode: which agent versions produced it. */
  agentVersions?: Record<string, number>
  iterations?: number
  feedback?: DsdFeedback[]
}

export interface DsdArtifact extends DsdArtifactMeta {
  markdown: string
  sha?: string
}

const SAFE_ARTIFACT_ID = /^[A-Za-z0-9_-]+$/

function dirFor(solutionId: string): string {
  return `dsd/${solutionId}/`
}
function pathFor(solutionId: string, artifactId: string): string {
  return `dsd/${solutionId}/${artifactId}.md`
}

/** Filesystem-safe, sortable artifact id from the current time. */
export function newArtifactId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function serialize(meta: DsdArtifactMeta, markdown: string): string {
  const fm = yaml.dump(meta, { lineWidth: -1, noRefs: true, sortKeys: false })
  return `---\n${fm}---\n\n${markdown.trim()}\n`
}

function parse(content: string): { meta: Partial<DsdArtifactMeta>; markdown: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, markdown: content }
  let meta: Partial<DsdArtifactMeta> = {}
  try {
    meta = (yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) as Partial<DsdArtifactMeta>) || {}
  } catch {
    meta = {}
  }
  return { meta, markdown: content.slice(m[0].length).trimStart() }
}

/** List artifact metadata for a solution (newest first), without bodies. */
export async function listDsd(solutionId: string): Promise<DsdArtifactMeta[]> {
  const git = getGit()
  let entries: { path: string; sha: string }[]
  try {
    entries = await git.listTree(dirFor(solutionId))
  } catch {
    return []
  }
  const files = entries.filter((e) => e.path.endsWith(".md"))
  const metas = await Promise.all(
    files.map(async (f) => {
      try {
        const content = await git.getBlob(f.sha)
        const { meta } = parse(content)
        return meta.id ? (meta as DsdArtifactMeta) : null
      } catch (err) {
        getLogger().error(`Failed to read DSD ${f.path}`, {
          err: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    })
  )
  return (metas.filter(Boolean) as DsdArtifactMeta[]).sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || "")
  )
}

export async function getDsd(solutionId: string, artifactId: string): Promise<DsdArtifact> {
  if (!SAFE_ARTIFACT_ID.test(artifactId)) throw new GitNotFoundError("Invalid artifact id")
  const git = getGit()
  const file = await git.getFile(pathFor(solutionId, artifactId))
  const { meta, markdown } = parse(file.content)
  return { ...(meta as DsdArtifactMeta), markdown, sha: file.sha }
}

export async function saveDsd(meta: DsdArtifactMeta, markdown: string): Promise<void> {
  const git = getGit()
  const content = serialize(meta, markdown)
  await git.putFile(
    pathFor(meta.solutionId, meta.id),
    content,
    `docs: add DSD ${meta.id} for ${meta.solutionId}`
  )
}

export async function deleteDsd(solutionId: string, artifactId: string): Promise<void> {
  if (!SAFE_ARTIFACT_ID.test(artifactId)) throw new GitNotFoundError("Invalid artifact id")
  const git = getGit()
  const file = await git.getFile(pathFor(solutionId, artifactId))
  await git.deleteFile(
    pathFor(solutionId, artifactId),
    file.sha,
    `docs: remove DSD ${artifactId} for ${solutionId}`
  )
}

export async function addFeedback(
  solutionId: string,
  artifactId: string,
  feedback: DsdFeedback
): Promise<void> {
  if (!SAFE_ARTIFACT_ID.test(artifactId)) throw new GitNotFoundError("Invalid artifact id")
  const git = getGit()
  const file = await git.getFile(pathFor(solutionId, artifactId))
  const { meta, markdown } = parse(file.content)
  const m = meta as DsdArtifactMeta
  m.feedback = [...(m.feedback || []), feedback]
  await git.putFile(
    pathFor(solutionId, artifactId),
    serialize(m, markdown),
    `docs: feedback on DSD ${artifactId}`,
    file.sha
  )
}

