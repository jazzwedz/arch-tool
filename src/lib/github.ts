import { Octokit } from "octokit"
import yaml from "js-yaml"
import type { Component, ComponentWithSha } from "./types"

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

const owner = process.env.GITHUB_OWNER!
const repo = process.env.GITHUB_REPO || "arch-data"
const branch = process.env.GITHUB_BRANCH || "main"

export async function listComponents(): Promise<Component[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "components",
      ref: branch,
    })

    if (!Array.isArray(data)) return []

    const yamlFiles = data.filter(
      (f) => f.type === "file" && f.name.endsWith(".yaml")
    )

    const components = await Promise.all(
      yamlFiles.map(async (file) => {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.path,
          ref: branch,
        })

        if (!("content" in fileData)) return null

        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        )
        return yaml.load(content) as Component
      })
    )

    return components.filter(Boolean) as Component[]
  } catch (error: unknown) {
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return []
    }
    throw error
  }
}

export async function getComponent(
  id: string
): Promise<ComponentWithSha> {
  const path = `components/${id}.yaml`

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  })

  if (!("content" in data)) {
    throw new Error(`Component ${id} not found`)
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8")
  const component = yaml.load(content) as Component

  return { ...component, sha: data.sha }
}

export async function saveComponent(
  component: Component,
  sha?: string
): Promise<void> {
  const path = `components/${component.id}.yaml`
  const content = yaml.dump(component, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  })

  const message = sha
    ? `feat: update component ${component.id}`
    : `feat: add component ${component.id}`

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  })
}

export async function deleteComponent(id: string, sha: string): Promise<void> {
  const path = `components/${id}.yaml`

  await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message: `feat: remove component ${id}`,
    sha,
    branch,
  })
}
