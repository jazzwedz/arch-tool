import { NextResponse } from "next/server"
import { getGit, getGitProviderName, isGitConfigured } from "@/lib/git"

// POST — live-probe the configured Git backend by listing the components/
// tree. An empty result is still a success (auth + network round-tripped),
// only thrown errors mark the check as failing.
export async function POST() {
  const provider = getGitProviderName()
  const startedAt = Date.now()

  if (!isGitConfigured()) {
    return NextResponse.json({
      ok: false,
      provider,
      elapsedMs: 0,
      error: "Git backend is not configured for this provider.",
    })
  }

  try {
    const git = getGit()
    const entries = await git.listTree("components/")
    return NextResponse.json({
      ok: true,
      provider,
      branch: git.branch,
      componentsFound: entries.length,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: unknown) {
    return NextResponse.json({
      ok: false,
      provider,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
