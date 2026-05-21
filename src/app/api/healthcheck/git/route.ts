import { NextResponse } from "next/server"
import { getGit, getGitProviderName, missingGitEnvVars } from "@/lib/git"

// POST — verbose live-probe of the configured Git backend. Returns the
// sanitized self-description, a four-step probe trace, and (when nothing
// is configured) the list of env vars that need to be set.
export async function POST() {
  const provider = getGitProviderName()
  const missing = missingGitEnvVars()

  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      configured: false,
      provider,
      missingEnv: missing,
      error: `Not configured — set: ${missing.join(", ")}.`,
    })
  }

  try {
    const git = getGit()
    const describe = git.describe()
    const trace = await git.probe()
    return NextResponse.json({
      ok: trace.ok,
      configured: true,
      provider,
      branch: git.branch,
      describe,
      trace,
      elapsedMs: trace.totalMs,
    })
  } catch (error: unknown) {
    return NextResponse.json({
      ok: false,
      configured: true,
      provider,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
