import { NextResponse } from "next/server"
import { getComponent, saveComponent, deleteComponent } from "@/lib/github"
import { isValidName } from "@/lib/validate"
import { getLockProvider } from "@/lib/locks"
import { getCurrentUser } from "@/lib/current-user"
import { withRequestContext } from "@/lib/request-context"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const component = await getComponent(id)
    return NextResponse.json(component)
  } catch (error) {
    console.error("Failed to get component:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const user = getCurrentUser(request)

    // Hard-lock gate: when locking is supported (currently filesystem
    // mode only) and someone else owns the lock, refuse the save. The
    // hash-based concurrency check inside the provider is the safety
    // net for everything else (e.g. lock expired mid-edit).
    const lock = getLockProvider()
    if (lock.supported) {
      const status = await lock.status(id, user)
      if (status.inUse && status.current && !status.ownedByYou) {
        return NextResponse.json(
          {
            error: "lock-held-by-other",
            currentEditor: status.current.user,
            since: status.current.acquiredAt,
            message: `Cannot save — ${status.current.user} is editing this component.`,
          },
          { status: 409 }
        )
      }
    }

    const { sha, ...component } = await request.json()
    if (component.id !== id) {
      return NextResponse.json(
        { error: "Component ID mismatch" },
        { status: 400 }
      )
    }

    // Thread the user identity through the async chain so the
    // filesystem provider can record it in the history sidecar.
    await withRequestContext({ user }, async () => {
      await saveComponent(component, sha)
    })

    // Best-effort lock release after a successful save. Users who keep
    // editing will re-acquire on the next form interaction.
    if (lock.supported) {
      await lock.release(id, user).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : 500
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Failed to update component:", message)
    return NextResponse.json(
      { error: status === 409 ? "conflict" : "Failed to update component", message },
      { status: status === 409 ? 409 : 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidName(id)) {
      return NextResponse.json({ error: "Invalid component ID" }, { status: 400 })
    }
    const user = getCurrentUser(request)

    const lock = getLockProvider()
    if (lock.supported) {
      const status = await lock.status(id, user)
      if (status.inUse && status.current && !status.ownedByYou) {
        return NextResponse.json(
          {
            error: "lock-held-by-other",
            currentEditor: status.current.user,
            since: status.current.acquiredAt,
            message: `Cannot delete — ${status.current.user} is editing this component.`,
          },
          { status: 409 }
        )
      }
    }

    const { sha } = await request.json()
    await withRequestContext({ user }, async () => {
      await deleteComponent(id, sha)
    })

    if (lock.supported) {
      await lock.release(id, user).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete component:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json(
      { error: "Failed to delete component" },
      { status: 500 }
    )
  }
}
