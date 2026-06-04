// Plain TypeScript validator for component YAML imports.
//
// Used both client-side (in the Import dialog for instant feedback)
// and server-side (in /api/components/import) — the same module runs
// in both places. No external dependency on Zod or similar; the rules
// here mirror the shapes declared in src/lib/types.ts.
//
// Errors hard-block import; warnings are surfaced to the user but the
// import still goes through. Unknown top-level keys, unknown sub-keys
// inside objects, and a `data_model` block on a non-table component
// are warnings — they keep forward-compat with future schema bumps
// from working installs.

import yaml from "js-yaml"

import {
  COMPONENT_TYPES,
  COMPONENT_STATUSES,
  CONNECTOR_TYPES,
  INTERFACE_DIRECTIONS,
  RELATIONSHIP_TYPES,
  DATA_KINDS,
  DATA_CLASSIFICATIONS,
  SCALING_MODELS,
  CAPABILITY_ROLES,
  PROCESS_ROLES,
  RULE_KINDS,
} from "./constants"
import type { Component } from "./types"

// ---------- result types ----------

export interface ValidationIssue {
  /** Dotted path into the YAML — e.g. "relationships[2].type". */
  path: string
  message: string
}

export type ValidateResult =
  | {
      ok: true
      /** Parsed component, with defaults applied (type=component, status=draft). */
      value: Component
      warnings: ValidationIssue[]
    }
  | {
      ok: false
      errors: ValidationIssue[]
      /** Warnings collected before the first error. May be empty. */
      warnings: ValidationIssue[]
    }

// ---------- known field sets ----------

const KNOWN_TOP_LEVEL = new Set<string>([
  "id",
  "name",
  "type",
  "status",
  "owner",
  "tags",
  "description",
  "interfaces",
  "relationships",
  "risks",
  "business_capabilities", // legacy, migrated at read time
  "capabilities",
  "data",
  "processes",
  "rules",
  "nfr",
  "diagram",
  "data_model",
])

const KNOWN_DESCRIPTION = new Set(["oneliner", "description", "technical", "business"])
const KNOWN_INTERFACE = new Set(["name", "direction", "type", "target", "description"])
const KNOWN_RELATIONSHIP = new Set(["target", "type", "connector", "description"])
const KNOWN_NFR = new Set([
  "availability",
  "rto",
  "rpo",
  "max_latency",
  "throughput",
  "data_classification",
  "scaling",
])
const KNOWN_CAPABILITY = new Set(["name", "role", "description"])
const KNOWN_DATA_ITEM = new Set(["name", "kind", "source", "consumers", "purpose", "description"])
const KNOWN_PROCESS = new Set(["name", "role", "activity", "description"])
const KNOWN_RULE = new Set([
  "name",
  "kind",
  "summary",
  "description",
  "formula",
  "given",
  "when",
  "then",
  "enforced_in",
])
const KNOWN_DIAGRAM = new Set(["color", "shape"])
const KNOWN_DATA_MODEL = new Set(["entity"])

// ---------- helpers ----------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
}

// Convert a free-form name into a YAML-safe component id. Kept in sync
// with slugifyForId in ComponentForm — duplicated here so the validator
// can run server-side without pulling in a React client component.
export function slugifyId(name: string): string {
  return (name || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^a-z0-9_\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
}

// Same regex as src/lib/validate.ts isValidName — kept duplicated so
// this module has no side imports.
const SAFE_ID_RE = /^[a-zA-Z0-9_\-. ]+$/
function isValidId(id: string): boolean {
  return !!id && SAFE_ID_RE.test(id) && !id.includes("..")
}

// ---------- main entrypoint ----------

export function validateComponentYaml(text: string): ValidateResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  // Parse
  let raw: unknown
  try {
    raw = yaml.load(text, { schema: yaml.JSON_SCHEMA })
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          message: err instanceof Error ? err.message : "YAML parse error",
        },
      ],
      warnings: [],
    }
  }

  if (raw === null || raw === undefined) {
    return {
      ok: false,
      errors: [{ path: "", message: "Empty YAML." }],
      warnings: [],
    }
  }

  // Single component only — refuse multi-doc and top-level arrays.
  if (Array.isArray(raw)) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          message:
            "Top level is a list. Import accepts a single component object only.",
        },
      ],
      warnings: [],
    }
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: [{ path: "", message: "Top level must be a YAML object." }],
      warnings: [],
    }
  }

  // --- Required: name ---
  const name = raw.name
  if (typeof name !== "string" || name.trim() === "") {
    errors.push({ path: "name", message: "name is required and must be a non-empty string." })
  }

  // --- id ---
  let id = ""
  if (raw.id !== undefined) {
    if (typeof raw.id !== "string" || raw.id.trim() === "") {
      errors.push({ path: "id", message: "id must be a non-empty string when provided." })
    } else if (!isValidId(raw.id)) {
      errors.push({
        path: "id",
        message:
          "id contains invalid characters. Use letters, digits, dashes, underscores, dots and spaces.",
      })
    } else {
      id = raw.id
    }
  } else if (typeof name === "string") {
    id = slugifyId(name)
    if (!id) {
      errors.push({
        path: "id",
        message: "Cannot auto-generate id from name. Add an `id` field manually.",
      })
    }
  }

  // --- type ---
  let type: Component["type"] = "component"
  if (raw.type !== undefined) {
    if (typeof raw.type !== "string" || !COMPONENT_TYPES.includes(raw.type as Component["type"])) {
      errors.push({
        path: "type",
        message: `type must be one of: ${COMPONENT_TYPES.join(", ")}.`,
      })
    } else {
      type = raw.type as Component["type"]
    }
  }

  // --- status ---
  let status: Component["status"] = "draft"
  if (raw.status !== undefined) {
    if (
      typeof raw.status !== "string" ||
      !COMPONENT_STATUSES.includes(raw.status as Component["status"])
    ) {
      errors.push({
        path: "status",
        message: `status must be one of: ${COMPONENT_STATUSES.join(", ")}.`,
      })
    } else {
      status = raw.status as Component["status"]
    }
  }

  // --- owner ---
  let owner = ""
  if (raw.owner !== undefined) {
    if (typeof raw.owner !== "string") {
      errors.push({ path: "owner", message: "owner must be a string." })
    } else {
      owner = raw.owner
    }
  }

  // --- tags ---
  let tags: string[] = []
  if (raw.tags !== undefined) {
    if (!isStringArray(raw.tags)) {
      errors.push({ path: "tags", message: "tags must be a list of strings." })
    } else {
      tags = raw.tags
    }
  }

  // --- description (object) ---
  let description: Component["description"] = {}
  if (raw.description !== undefined) {
    if (!isPlainObject(raw.description)) {
      errors.push({
        path: "description",
        message: "description must be an object (with `description`, etc.).",
      })
    } else {
      for (const k of Object.keys(raw.description)) {
        if (!KNOWN_DESCRIPTION.has(k)) {
          warnings.push({ path: `description.${k}`, message: `Unknown field — ignored.` })
        } else if (raw.description[k] !== undefined && typeof raw.description[k] !== "string") {
          errors.push({ path: `description.${k}`, message: `Must be a string.` })
        }
      }
      description = raw.description as Component["description"]
    }
  }

  // --- interfaces ---
  let interfaces: Component["interfaces"] = []
  if (raw.interfaces !== undefined) {
    if (!Array.isArray(raw.interfaces)) {
      errors.push({ path: "interfaces", message: "interfaces must be a list." })
    } else {
      const out: Component["interfaces"] = []
      raw.interfaces.forEach((iface, i) => {
        const p = `interfaces[${i}]`
        if (!isPlainObject(iface)) {
          errors.push({ path: p, message: "Must be an object." })
          return
        }
        for (const k of Object.keys(iface)) {
          if (!KNOWN_INTERFACE.has(k)) {
            warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
          }
        }
        if (
          typeof iface.direction !== "string" ||
          !INTERFACE_DIRECTIONS.includes(iface.direction as "provides" | "consumes")
        ) {
          errors.push({
            path: `${p}.direction`,
            message: `direction must be one of: ${INTERFACE_DIRECTIONS.join(", ")}.`,
          })
        }
        if (
          typeof iface.type !== "string" ||
          !CONNECTOR_TYPES.includes(iface.type as (typeof CONNECTOR_TYPES)[number])
        ) {
          errors.push({
            path: `${p}.type`,
            message: `type must be one of: ${CONNECTOR_TYPES.join(", ")}.`,
          })
        }
        if (iface.target !== undefined && typeof iface.target !== "string") {
          errors.push({ path: `${p}.target`, message: "target must be a string." })
        }
        if (iface.name !== undefined && typeof iface.name !== "string") {
          errors.push({ path: `${p}.name`, message: "name must be a string when provided." })
        }
        if (typeof iface.description !== "string") {
          errors.push({ path: `${p}.description`, message: "description is required." })
        }
        out.push(iface as unknown as Component["interfaces"][number])
      })
      interfaces = out
    }
  }

  // --- relationships ---
  let relationships: Component["relationships"] = []
  if (raw.relationships !== undefined) {
    if (!Array.isArray(raw.relationships)) {
      errors.push({ path: "relationships", message: "relationships must be a list." })
    } else {
      const out: Component["relationships"] = []
      raw.relationships.forEach((rel, i) => {
        const p = `relationships[${i}]`
        if (!isPlainObject(rel)) {
          errors.push({ path: p, message: "Must be an object." })
          return
        }
        for (const k of Object.keys(rel)) {
          if (!KNOWN_RELATIONSHIP.has(k)) {
            warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
          }
        }
        if (typeof rel.target !== "string" || rel.target === "") {
          errors.push({ path: `${p}.target`, message: "target is required." })
        }
        if (
          typeof rel.type !== "string" ||
          !RELATIONSHIP_TYPES.includes(rel.type as (typeof RELATIONSHIP_TYPES)[number])
        ) {
          errors.push({
            path: `${p}.type`,
            message: `type must be one of: ${RELATIONSHIP_TYPES.join(", ")}.`,
          })
        }
        if (
          rel.connector !== undefined &&
          (typeof rel.connector !== "string" ||
            !CONNECTOR_TYPES.includes(rel.connector as (typeof CONNECTOR_TYPES)[number]))
        ) {
          errors.push({
            path: `${p}.connector`,
            message: `connector must be one of: ${CONNECTOR_TYPES.join(", ")}.`,
          })
        }
        out.push(rel as unknown as Component["relationships"][number])
      })
      relationships = out
    }
  }

  // --- risks ---
  let risks: string[] | undefined
  if (raw.risks !== undefined) {
    if (!isStringArray(raw.risks)) {
      errors.push({ path: "risks", message: "risks must be a list of strings." })
    } else {
      risks = raw.risks
    }
  }

  // --- business_capabilities (legacy) ---
  let businessCapabilities: string[] | undefined
  if (raw.business_capabilities !== undefined) {
    if (!isStringArray(raw.business_capabilities)) {
      errors.push({
        path: "business_capabilities",
        message: "business_capabilities must be a list of strings.",
      })
    } else {
      warnings.push({
        path: "business_capabilities",
        message: "Legacy field — will be migrated into `capabilities` on first save.",
      })
      businessCapabilities = raw.business_capabilities
    }
  }

  // --- capabilities ---
  let capabilities: Component["capabilities"]
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities)) {
      errors.push({ path: "capabilities", message: "capabilities must be a list." })
    } else {
      const out: NonNullable<Component["capabilities"]> = []
      raw.capabilities.forEach((cap, i) => {
        const p = `capabilities[${i}]`
        if (!isPlainObject(cap)) {
          errors.push({ path: p, message: "Must be an object." })
          return
        }
        for (const k of Object.keys(cap)) {
          if (!KNOWN_CAPABILITY.has(k)) {
            warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
          }
        }
        if (typeof cap.name !== "string" || cap.name === "") {
          errors.push({ path: `${p}.name`, message: "name is required." })
        }
        if (
          typeof cap.role !== "string" ||
          !CAPABILITY_ROLES.includes(cap.role as (typeof CAPABILITY_ROLES)[number])
        ) {
          errors.push({
            path: `${p}.role`,
            message: `role must be one of: ${CAPABILITY_ROLES.join(", ")}.`,
          })
        }
        out.push(cap as unknown as NonNullable<Component["capabilities"]>[number])
      })
      capabilities = out
    }
  }

  // --- data ---
  let data: Component["data"]
  if (raw.data !== undefined) {
    if (!isPlainObject(raw.data)) {
      errors.push({ path: "data", message: "data must be an object." })
    } else {
      const out: NonNullable<Component["data"]> = {}
      for (const bucket of ["inputs", "outputs", "owns"] as const) {
        if (raw.data[bucket] === undefined) continue
        if (!Array.isArray(raw.data[bucket])) {
          errors.push({ path: `data.${bucket}`, message: "Must be a list." })
          continue
        }
        const items: NonNullable<NonNullable<Component["data"]>[typeof bucket]> = []
        ;(raw.data[bucket] as unknown[]).forEach((it, i) => {
          const p = `data.${bucket}[${i}]`
          if (!isPlainObject(it)) {
            errors.push({ path: p, message: "Must be an object." })
            return
          }
          for (const k of Object.keys(it)) {
            if (!KNOWN_DATA_ITEM.has(k)) {
              warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
            }
          }
          if (typeof it.name !== "string" || it.name === "") {
            errors.push({ path: `${p}.name`, message: "name is required." })
          }
          if (
            typeof it.kind !== "string" ||
            !DATA_KINDS.includes(it.kind as (typeof DATA_KINDS)[number])
          ) {
            errors.push({
              path: `${p}.kind`,
              message: `kind must be one of: ${DATA_KINDS.join(", ")}.`,
            })
          }
          if (it.source !== undefined && typeof it.source !== "string") {
            errors.push({ path: `${p}.source`, message: "source must be a string." })
          }
          if (it.consumers !== undefined && !isStringArray(it.consumers)) {
            errors.push({
              path: `${p}.consumers`,
              message: "consumers must be a list of strings.",
            })
          }
          items.push(it as unknown as NonNullable<NonNullable<Component["data"]>[typeof bucket]>[number])
        })
        out[bucket] = items
      }
      // Warn on unknown sub-keys of `data`.
      for (const k of Object.keys(raw.data)) {
        if (k !== "inputs" && k !== "outputs" && k !== "owns") {
          warnings.push({ path: `data.${k}`, message: "Unknown field — ignored." })
        }
      }
      data = out
    }
  }

  // --- processes ---
  let processes: Component["processes"]
  if (raw.processes !== undefined) {
    if (!Array.isArray(raw.processes)) {
      errors.push({ path: "processes", message: "processes must be a list." })
    } else {
      const out: NonNullable<Component["processes"]> = []
      raw.processes.forEach((proc, i) => {
        const p = `processes[${i}]`
        if (!isPlainObject(proc)) {
          errors.push({ path: p, message: "Must be an object." })
          return
        }
        for (const k of Object.keys(proc)) {
          if (!KNOWN_PROCESS.has(k)) {
            warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
          }
        }
        if (typeof proc.name !== "string" || proc.name === "") {
          errors.push({ path: `${p}.name`, message: "name is required." })
        }
        if (
          typeof proc.role !== "string" ||
          !PROCESS_ROLES.includes(proc.role as (typeof PROCESS_ROLES)[number])
        ) {
          errors.push({
            path: `${p}.role`,
            message: `role must be one of: ${PROCESS_ROLES.join(", ")}.`,
          })
        }
        out.push(proc as unknown as NonNullable<Component["processes"]>[number])
      })
      processes = out
    }
  }

  // --- rules ---
  let rules: Component["rules"]
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules)) {
      errors.push({ path: "rules", message: "rules must be a list." })
    } else {
      const out: NonNullable<Component["rules"]> = []
      raw.rules.forEach((rule, i) => {
        const p = `rules[${i}]`
        if (!isPlainObject(rule)) {
          errors.push({ path: p, message: "Must be an object." })
          return
        }
        for (const k of Object.keys(rule)) {
          if (!KNOWN_RULE.has(k)) {
            warnings.push({ path: `${p}.${k}`, message: "Unknown field — ignored." })
          }
        }
        if (typeof rule.name !== "string" || rule.name === "") {
          errors.push({ path: `${p}.name`, message: "name is required." })
        }
        if (
          typeof rule.kind !== "string" ||
          !RULE_KINDS.includes(rule.kind as (typeof RULE_KINDS)[number])
        ) {
          errors.push({
            path: `${p}.kind`,
            message: `kind must be one of: ${RULE_KINDS.join(", ")}.`,
          })
        }
        if (rule.enforced_in !== undefined && !isStringArray(rule.enforced_in)) {
          errors.push({
            path: `${p}.enforced_in`,
            message: "enforced_in must be a list of strings.",
          })
        }
        out.push(rule as unknown as NonNullable<Component["rules"]>[number])
      })
      rules = out
    }
  }

  // --- nfr ---
  let nfr: Component["nfr"]
  if (raw.nfr !== undefined) {
    if (!isPlainObject(raw.nfr)) {
      errors.push({ path: "nfr", message: "nfr must be an object." })
    } else {
      for (const k of Object.keys(raw.nfr)) {
        if (!KNOWN_NFR.has(k)) {
          warnings.push({ path: `nfr.${k}`, message: "Unknown field — ignored." })
        }
      }
      if (
        raw.nfr.data_classification !== undefined &&
        (typeof raw.nfr.data_classification !== "string" ||
          !DATA_CLASSIFICATIONS.includes(
            raw.nfr.data_classification as (typeof DATA_CLASSIFICATIONS)[number]
          ))
      ) {
        errors.push({
          path: "nfr.data_classification",
          message: `data_classification must be one of: ${DATA_CLASSIFICATIONS.join(", ")}.`,
        })
      }
      if (
        raw.nfr.scaling !== undefined &&
        (typeof raw.nfr.scaling !== "string" ||
          !SCALING_MODELS.includes(raw.nfr.scaling as (typeof SCALING_MODELS)[number]))
      ) {
        errors.push({
          path: "nfr.scaling",
          message: `scaling must be one of: ${SCALING_MODELS.join(", ")}.`,
        })
      }
      nfr = raw.nfr as Component["nfr"]
    }
  }

  // --- diagram ---
  let diagram: Component["diagram"]
  if (raw.diagram !== undefined) {
    if (!isPlainObject(raw.diagram)) {
      errors.push({ path: "diagram", message: "diagram must be an object." })
    } else {
      for (const k of Object.keys(raw.diagram)) {
        if (!KNOWN_DIAGRAM.has(k)) {
          warnings.push({ path: `diagram.${k}`, message: "Unknown field — ignored." })
        }
      }
      diagram = raw.diagram as Component["diagram"]
    }
  }

  // --- data_model ---
  let dataModel: Component["data_model"]
  if (raw.data_model !== undefined) {
    if (!isPlainObject(raw.data_model)) {
      errors.push({ path: "data_model", message: "data_model must be an object." })
    } else {
      for (const k of Object.keys(raw.data_model)) {
        if (!KNOWN_DATA_MODEL.has(k)) {
          warnings.push({ path: `data_model.${k}`, message: "Unknown field — ignored." })
        }
      }
      if (typeof raw.data_model.entity !== "string" || raw.data_model.entity === "") {
        errors.push({
          path: "data_model.entity",
          message: "entity is required when data_model is set.",
        })
      }
      if (type !== "table") {
        warnings.push({
          path: "data_model",
          message:
            "data_model is only meaningful on type=table. The link will be saved but not shown.",
        })
      }
      dataModel = raw.data_model as unknown as Component["data_model"]
    }
  }

  // --- unknown top-level keys ---
  for (const k of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL.has(k)) {
      warnings.push({ path: k, message: "Unknown top-level field — ignored on save." })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings }
  }

  const out: Component = {
    id,
    name: name as string,
    type,
    status,
    owner,
    tags,
    description,
    interfaces,
    relationships,
  }
  if (risks !== undefined) out.risks = risks
  if (businessCapabilities !== undefined) out.business_capabilities = businessCapabilities
  if (capabilities !== undefined) out.capabilities = capabilities
  if (data !== undefined) out.data = data
  if (processes !== undefined) out.processes = processes
  if (rules !== undefined) out.rules = rules
  if (nfr !== undefined) out.nfr = nfr
  if (diagram !== undefined) out.diagram = diagram
  if (dataModel !== undefined) out.data_model = dataModel

  return { ok: true, value: out, warnings }
}
