// Runtime configuration loaded from `config.yaml` at the root of the
// arch-data repo. Optional — when the file is missing or unreadable, callers
// get an empty object and fall back to env vars or built-in defaults.
//
// This is the single place to put non-secret, team-shared settings that
// should survive across deployments and be editable through the Settings
// page in the future (model name, default audience, etc.). Secrets always
// stay in environment variables.

import { Octokit } from "octokit"
import yaml from "js-yaml"

export interface RuntimeConfig {
  llm?: {
    model?: string
  }
}

const TTL_MS = 60_000
let _cached: { value: RuntimeConfig; loadedAt: number } | null = null

export async function loadConfig(): Promise<RuntimeConfig> {
  const now = Date.now()
  if (_cached && now - _cached.loadedAt < TTL_MS) return _cached.value

  const token = process.env.GITHUB_TOKEN
  const owner = process.env.GITHUB_OWNER
  const repo = process.env.GITHUB_REPO || "arch-data"
  const branch = process.env.GITHUB_BRANCH || "main"

  if (!token || !owner) {
    _cached = { value: {}, loadedAt: now }
    return {}
  }

  try {
    const octokit = new Octokit({ auth: token })
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "config.yaml",
      ref: branch,
    })
    if (Array.isArray(data) || !("content" in data) || typeof data.content !== "string") {
      _cached = { value: {}, loadedAt: now }
      return {}
    }
    const text = Buffer.from(data.content, "base64").toString("utf8")
    const parsed = yaml.load(text)
    const value: RuntimeConfig =
      parsed && typeof parsed === "object" ? (parsed as RuntimeConfig) : {}
    _cached = { value, loadedAt: now }
    return value
  } catch {
    // 404 (config.yaml missing) is the common case — treat as empty config.
    _cached = { value: {}, loadedAt: now }
    return {}
  }
}

export function clearConfigCache(): void {
  _cached = null
}
