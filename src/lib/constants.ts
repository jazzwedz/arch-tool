import {
  Cpu,
  Monitor,
  Database,
  MessageSquare,
  GitMerge,
  Globe,
  Layers,
  Package,
  Workflow,
  HardDrive,
  Clock,
  Zap,
} from "lucide-react"
import type { ComponentType, ComponentStatus } from "./types"

export const TYPE_ICONS: Record<ComponentType, typeof Cpu> = {
  microservice: Cpu,
  frontend: Monitor,
  database: Database,
  queue: MessageSquare,
  gateway: GitMerge,
  external: Globe,
  platform: Layers,
  library: Package,
  "data-pipeline": Workflow,
  storage: HardDrive,
  "batch-job": Clock,
  cache: Zap,
}

export const TYPE_LABELS: Record<ComponentType, string> = {
  microservice: "Microservice",
  frontend: "Frontend",
  database: "Database",
  queue: "Queue",
  gateway: "Gateway",
  external: "External",
  platform: "Platform",
  library: "Library",
  "data-pipeline": "Data Pipeline",
  storage: "Storage",
  "batch-job": "Batch Job",
  cache: "Cache",
}

export const STATUS_COLORS: Record<ComponentStatus, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-300",
  production: "bg-green-100 text-green-800 border-green-300",
  deprecated: "bg-gray-100 text-gray-500 border-gray-300",
}

export const COMPONENT_TYPES: ComponentType[] = [
  "microservice",
  "frontend",
  "database",
  "cache",
  "queue",
  "data-pipeline",
  "batch-job",
  "storage",
  "gateway",
  "external",
  "platform",
  "library",
]

export const COMPONENT_STATUSES: ComponentStatus[] = [
  "draft",
  "production",
  "deprecated",
]

export const CONNECTOR_TYPES = [
  "rest",
  "grpc",
  "async",
  "db",
  "file",
  "human",
] as const

export const INTERFACE_DIRECTIONS = ["provides", "consumes"] as const

export const RELATIONSHIP_TYPES = [
  "parent-of",
  "child-of",
  "depends-on",
  "communicates-with",
  "reads-from",
  "writes-to",
  "fallback",
] as const

export const RELATIONSHIP_LABELS: Record<string, string> = {
  "parent-of": "Parent of",
  "child-of": "Child of",
  "depends-on": "Depends on",
  "communicates-with": "Communicates with",
  "reads-from": "Reads from",
  "writes-to": "Writes to",
  "fallback": "Fallback for",
}

// Colors matching Draw.io library export (drawio.ts typeStyles)
// Each type has: fill (very subtle bg), border (left accent), text (icon/label tint)
export const TYPE_COLORS: Record<ComponentType, { fill: string; border: string; text: string }> = {
  microservice:    { fill: "#dae8fc", border: "#6c8ebf", text: "#4a6fa5" },
  frontend:        { fill: "#d5e8d4", border: "#82b366", text: "#5a8a42" },
  database:        { fill: "#fff2cc", border: "#d6b656", text: "#b8941e" },
  queue:           { fill: "#f8cecc", border: "#b85450", text: "#a03e3a" },
  gateway:         { fill: "#e1d5e7", border: "#9673a6", text: "#7a5a8a" },
  external:        { fill: "#f5f5f5", border: "#666666", text: "#555555" },
  platform:        { fill: "#ffe6cc", border: "#d79b00", text: "#b88400" },
  library:         { fill: "#f0f0f0", border: "#999999", text: "#777777" },
  "data-pipeline": { fill: "#d4e8f7", border: "#3a7ca5", text: "#2c6a8f" },
  storage:         { fill: "#e8dff0", border: "#7b5ea7", text: "#654b8a" },
  "batch-job":     { fill: "#fce4d6", border: "#c55a11", text: "#a84b0f" },
  cache:           { fill: "#d6f5d6", border: "#48a848", text: "#357a35" },
}
