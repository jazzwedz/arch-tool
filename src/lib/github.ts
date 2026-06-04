// Domain store: components, diagrams and Confluence link side-files.
//
// Stays under the historical filename `github.ts` so the 12 API route
// imports keep working, but the implementation is now backend-agnostic —
// it routes every read and write through the GitProvider selected via the
// GIT_PROVIDER env var (see src/lib/git/index.ts). Today that means
// GitHub or Azure DevOps; new backends slot in without touching this
// layer.

import yaml from "js-yaml"
import { getGit, GitNotFoundError } from "./git"
import type { Component, ComponentWithSha, DiagramWithSha } from "./types"
import { getLogger } from "./log"

// Backward compatibility for legacy YAML shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateComponent(raw: Record<string, any>): Component {
  // Old `dependencies` array → new `relationships` format.
  if (raw.dependencies && Array.isArray(raw.dependencies) && !raw.relationships) {
    raw.relationships = raw.dependencies.map((dep: { id: string; connector?: string }) => ({
      target: dep.id,
      type: "depends-on" as const,
      connector: dep.connector,
    }))
    delete raw.dependencies
  }
  if (!raw.relationships) {
    raw.relationships = []
  }
  // Old `business_capabilities: string[]` → new `capabilities: { name, role }[]`.
  // Conservative default role "indirect" because legacy data carried no role info.
  if (
    Array.isArray(raw.business_capabilities) &&
    !Array.isArray(raw.capabilities)
  ) {
    raw.capabilities = raw.business_capabilities
      .filter((n: unknown) => typeof n === "string" && n.trim().length > 0)
      .map((name: string) => ({
        name,
        role: "indirect" as const,
      }))
    delete raw.business_capabilities
  }
  // Old `data.consumes` / `data.produces` → new `data.inputs` / `data.outputs`.
  // Renamed to make the input/output dimension obvious to BAs and DEVs alike.
  if (raw.data && typeof raw.data === "object") {
    if (Array.isArray(raw.data.consumes) && !Array.isArray(raw.data.inputs)) {
      raw.data.inputs = raw.data.consumes
      delete raw.data.consumes
    }
    if (Array.isArray(raw.data.produces) && !Array.isArray(raw.data.outputs)) {
      raw.data.outputs = raw.data.produces
      delete raw.data.produces
    }
  }
  return raw as Component
}

export async function listComponents(): Promise<Component[]> {
  const git = getGit()
  const entries = await git.listTree("components/")
  const yamlFiles = entries.filter((e) => e.path.endsWith(".yaml"))

  const components = await Promise.all(
    yamlFiles.map(async (file) => {
      try {
        const content = await git.getBlob(file.sha)
        return migrateComponent(
          yaml.load(content, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>
        )
      } catch (err) {
        getLogger().error(`Failed to fetch component ${file.path}`, {
          err: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    })
  )

  return components.filter(Boolean) as Component[]
}

export async function getComponent(id: string): Promise<ComponentWithSha> {
  const git = getGit()
  const file = await git.getFile(`components/${id}.yaml`)
  const component = migrateComponent(
    yaml.load(file.content, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>
  )
  return { ...component, sha: file.sha }
}

export async function saveComponent(
  component: Component,
  sha?: string
): Promise<void> {
  const git = getGit()
  const path = `components/${component.id}.yaml`
  const content = yaml.dump(component, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  })
  const message = sha
    ? `feat: update component ${component.id}`
    : `feat: add component ${component.id}`
  await git.putFile(path, content, message, sha)
}

export async function deleteComponent(id: string, sha: string): Promise<void> {
  const git = getGit()
  await git.deleteFile(
    `components/${id}.yaml`,
    sha,
    `feat: remove component ${id}`
  )
}

// Component history

export interface ComponentCommit {
  sha: string
  message: string
  author: string
  date: string
}

export async function getComponentHistory(id: string): Promise<ComponentCommit[]> {
  const git = getGit()
  return git.listFileHistory(`components/${id}.yaml`, 50)
}

// Diagrams

export async function listDiagrams(): Promise<DiagramWithSha[]> {
  const git = getGit()
  const entries = await git.listTree("diagrams/")
  const drawioFiles = entries.filter((e) => e.path.endsWith(".drawio"))

  const diagrams = await Promise.all(
    drawioFiles.map(async (file) => {
      try {
        const content = await git.getBlob(file.sha)
        const name = file.path.replace("diagrams/", "").replace(".drawio", "")
        return { name, content, sha: file.sha } as DiagramWithSha
      } catch (err) {
        getLogger().error(`Failed to fetch diagram ${file.path}`, {
          err: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    })
  )

  return diagrams.filter(Boolean) as DiagramWithSha[]
}

export async function saveDiagram(
  name: string,
  content: string,
  sha?: string
): Promise<void> {
  const git = getGit()
  const path = `diagrams/${name}.drawio`
  const message = sha
    ? `feat: update diagram ${name}`
    : `feat: add diagram ${name}`
  await git.putFile(path, content, message, sha)
}

export async function getDiagram(name: string): Promise<DiagramWithSha> {
  const git = getGit()
  const file = await git.getFile(`diagrams/${name}.drawio`)
  return { name, content: file.content, sha: file.sha }
}

export async function deleteDiagram(name: string, sha: string): Promise<void> {
  const git = getGit()
  await git.deleteFile(
    `diagrams/${name}.drawio`,
    sha,
    `feat: remove diagram ${name}`
  )
}

// Confluence link side-file: maps a component to a Confluence page so that
// publish/pull stays stable even if the component is renamed.

export interface ConfluenceLink {
  componentId: string
  pageId: string
  spaceId: string
  lastSyncedAt: string
  lastPublishedVersion?: number
}

interface ConfluenceLinkWithSha extends ConfluenceLink {
  sha: string
}

export async function getConfluenceLink(
  componentId: string
): Promise<ConfluenceLinkWithSha | null> {
  const git = getGit()
  try {
    const file = await git.getFile(`confluence-links/${componentId}.json`)
    return { ...(JSON.parse(file.content) as ConfluenceLink), sha: file.sha }
  } catch (error: unknown) {
    if (error instanceof GitNotFoundError) return null
    throw error
  }
}

export async function saveConfluenceLink(
  link: ConfluenceLink,
  sha?: string
): Promise<void> {
  const git = getGit()
  const path = `confluence-links/${link.componentId}.json`
  const content = JSON.stringify(link, null, 2) + "\n"
  const message = sha
    ? `chore: update confluence link for ${link.componentId}`
    : `chore: add confluence link for ${link.componentId}`
  await git.putFile(path, content, message, sha)
}
