"use client"

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TypeIcon } from "./TypeIcon"
import { StatusBadge } from "./StatusBadge"
import type { Component } from "@/lib/types"
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/constants"

interface ComponentCardProps {
  component: Component
  compact?: boolean
}

export function ComponentCard({ component, compact }: ComponentCardProps) {
  const colors = TYPE_COLORS[component.type]

  if (compact) {
    return (
      <Link href={`/component/${component.id}`}>
        <Card
          className="hover:shadow-md transition-shadow cursor-pointer border-l-[3px] py-0"
          style={{
            borderLeftColor: colors.border,
            backgroundColor: `${colors.fill}18`,
          }}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <TypeIcon type={component.type} style={{ color: colors.text }} className="h-4 w-4 shrink-0" />
            <span className="font-medium text-sm truncate min-w-0">{component.name}</span>
            <span className="text-xs text-muted-foreground truncate min-w-0 hidden sm:inline">
              {component.description.oneliner}
            </span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground hidden md:inline">{component.owner}</span>
              <StatusBadge status={component.status} />
            </div>
          </div>
        </Card>
      </Link>
    )
  }

  return (
    <Link href={`/component/${component.id}`}>
      <Card
        className="h-full hover:shadow-md transition-shadow cursor-pointer border-l-[3px]"
        style={{
          borderLeftColor: colors.border,
          backgroundColor: `${colors.fill}18`,
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TypeIcon type={component.type} style={{ color: colors.text }} />
              <span className="text-xs uppercase tracking-wide font-medium" style={{ color: colors.text }}>
                {TYPE_LABELS[component.type]}
              </span>
            </div>
            <StatusBadge status={component.status} />
          </div>
          <CardTitle className="text-lg mt-2">{component.name}</CardTitle>
          <CardDescription>{component.description.oneliner}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{component.owner}</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {component.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {component.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{component.tags.length - 3}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
