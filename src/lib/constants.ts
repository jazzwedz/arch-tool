import {
  Cpu,
  Monitor,
  Database,
  MessageSquare,
  GitMerge,
  Globe,
  Layers,
  Package,
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
  "queue",
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
