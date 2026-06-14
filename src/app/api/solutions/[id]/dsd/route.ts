// DSD generation job endpoint.
//
//   POST /api/solutions/[id]/dsd        → start a job, returns { jobId }
//   GET  /api/solutions/[id]/dsd?jobId= → poll { status, phase, markdown? }
//
// The generation is a multi-call orchestration (draft → critic → revise)
// run as a detached in-process job so it survives the gateway's request
// timeout; the client polls for progress.

import { NextResponse } from "next/server"
import { getSolution } from "@/lib/solutions"
import { listComponents } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { isLLMConfigured, LLM_DISABLED_MESSAGE } from "@/lib/llm"
import { checkRateLimit } from "@/lib/rate-limit"
import { startDsdJob, getDsdJob } from "@/lib/solution-dsd"
import { withRouteContext } from "@/lib/route-context"
import { getLogger } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteContext(request, async () => {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid solution id" }, { status: 400 })
    }
    if (!isLLMConfigured()) {
      return NextResponse.json({ error: LLM_DISABLED_MESSAGE }, { status: 503 })
    }
    const clientIp = request.headers.get("x-forwarded-for") || "unknown"
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute before trying again." },
        { status: 429 }
      )
    }
    // Agent team is the default; quick is opt-in via the body.
    let mode: "quick" | "team" = "team"
    try {
      const body = await request.json().catch(() => null)
      if (body && body.mode === "quick") mode = "quick"
    } catch {
      // no body — default team
    }
    try {
      const solution = await getSolution(id)
      const components = await listComponents()
      const jobId = startDsdJob(solution, components, mode)
      return NextResponse.json({ jobId })
    } catch (error) {
      getLogger().error("Failed to start DSD job", {
        id,
        err: error instanceof Error ? error.message : "Unknown error",
      })
      return NextResponse.json(
        { error: `Failed to start DSD: ${error instanceof Error ? error.message : "Unknown error"}` },
        { status: 500 }
      )
    }
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteContext(request, async () => {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid solution id" }, { status: 400 })
    }
    const jobId = new URL(request.url).searchParams.get("jobId")
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
    }
    const job = getDsdJob(jobId)
    if (!job) {
      return NextResponse.json(
        { error: "Job not found (it may have expired). Generate again." },
        { status: 404 }
      )
    }
    return NextResponse.json({
      status: job.status,
      phase: job.phase,
      iterations: job.iterations,
      artifactId: job.artifactId,
      markdown: job.status === "done" ? job.markdown : undefined,
      error: job.error,
    })
  })
}
