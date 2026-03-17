"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ComponentForm } from "@/components/ComponentForm"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { ComponentWithSha } from "@/lib/types"

export default function EditComponentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [component, setComponent] = useState<ComponentWithSha | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/components/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found")
        return r.json()
      })
      .then(setComponent)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading component...
      </div>
    )
  }

  if (!component) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/component/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit: {component.name}</h1>
      </div>
      <ComponentForm initialData={component} isEdit />
    </div>
  )
}
