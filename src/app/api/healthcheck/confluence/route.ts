import { NextResponse } from "next/server"
import {
  getConfluenceEdition,
  isConfluenceConfigured,
  findPageByTitleInSpace,
} from "@/lib/confluence"

// POST — live-probe Confluence by searching for an intentionally
// non-existent title. A `null` response is a success (auth + network
// round-tripped without error); the probe never touches real content.
export async function POST() {
  const edition = getConfluenceEdition()
  const startedAt = Date.now()

  if (!isConfluenceConfigured()) {
    return NextResponse.json({
      ok: false,
      edition,
      elapsedMs: 0,
      error: "Confluence is not configured for this edition.",
    })
  }

  try {
    await findPageByTitleInSpace("__arch-tool-healthcheck-nonexistent__")
    return NextResponse.json({
      ok: true,
      edition,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: unknown) {
    return NextResponse.json({
      ok: false,
      edition,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
