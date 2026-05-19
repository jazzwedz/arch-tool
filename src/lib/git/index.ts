// Git provider factory — selects a backend based on the GIT_PROVIDER env var.
//
//   GIT_PROVIDER=github   → GitHubProvider (default)
//   GIT_PROVIDER=ado      → ADOProvider (also accepts "azure-devops")
//
// The provider holds connection details (URL, credentials, branch) at
// construction time. Switch by editing env vars and restarting the app.

import { GitHubProvider } from "./github"
import { ADOProvider } from "./ado"
import type { GitProvider } from "./types"

export type { GitProvider, GitFile, GitTreeEntry, GitCommitMeta } from "./types"
export { GitNotFoundError } from "./types"

export type GitProviderName = "github" | "ado"

let _provider: GitProvider | null = null

export function getGitProviderName(): GitProviderName {
  const raw = (process.env.GIT_PROVIDER || "github").toLowerCase().trim()
  if (raw === "ado" || raw === "azure-devops" || raw === "azuredevops") return "ado"
  return "github"
}

export function isGitConfigured(): boolean {
  const name = getGitProviderName()
  if (name === "github") {
    return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER)
  }
  return !!(
    process.env.ADO_BASE_URL &&
    process.env.ADO_PROJECT &&
    process.env.ADO_REPO &&
    process.env.ADO_PAT
  )
}

export function getGit(): GitProvider {
  if (_provider) return _provider
  const name = getGitProviderName()

  if (name === "github") {
    const token = process.env.GITHUB_TOKEN
    const owner = process.env.GITHUB_OWNER
    if (!token || !owner) {
      throw new Error(
        "GitHub provider not configured (set GITHUB_TOKEN and GITHUB_OWNER)."
      )
    }
    _provider = new GitHubProvider({
      token,
      owner,
      repo: process.env.GITHUB_REPO || "arch-data",
      branch: process.env.GITHUB_BRANCH || "main",
    })
    return _provider
  }

  const baseUrl = process.env.ADO_BASE_URL
  const project = process.env.ADO_PROJECT
  const repo = process.env.ADO_REPO
  const pat = process.env.ADO_PAT
  if (!baseUrl || !project || !repo || !pat) {
    throw new Error(
      "Azure DevOps provider not configured (set ADO_BASE_URL, ADO_PROJECT, ADO_REPO, ADO_PAT)."
    )
  }
  _provider = new ADOProvider({
    baseUrl,
    project,
    repo,
    branch: process.env.ADO_BRANCH || "main",
    pat,
  })
  return _provider
}

export function resetGitProvider(): void {
  _provider = null
}
