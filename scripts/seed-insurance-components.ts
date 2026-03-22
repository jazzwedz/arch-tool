import type { Component } from "../src/lib/types"

// 10 new insurance/reinsurance components inspired by the architecture documentation
const components: Component[] = [
  {
    id: "retro-efr-service",
    name: "Retro EFR Service",
    type: "microservice",
    status: "production",
    owner: "retro-platform-team",
    tags: ["core", "retrocession", "efr", "financial-reporting"],
    description: {
      oneliner: "Enterprise Financial Reporting service for retrocession cashflow processing",
      technical:
        "Java-based microservice orchestrating the end-to-end retrocession financial reporting pipeline. Generates Risk Adjustment (RA) outputs by consuming data from the silver_canonical layer, applying exchange rate conversions using quarterly average rates from MDM, and producing SICS-compatible bookings. Supports both final close runs (full quarterly rates) and interim runs (proxy average rates). Implements the Saga pattern for distributed transaction consistency across EFR, CIL, and IGR layers.",
      business:
        "Core service that automates the generation of retrocession financial reports, replacing manual processes previously handled by the Group Retro Manager (GRM). Ensures accurate currency conversion and timely reporting for both internal and external retrocession arrangements.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "REST API for triggering RA generation runs (final close and interim)",
      },
      {
        direction: "provides",
        type: "async",
        description: "Publishes RA completion events and cashflow data to Kafka topics",
      },
      {
        direction: "consumes",
        type: "db",
        target: "silver-canonical-store",
        description: "Reads best_estimate_cashflow_aggregated table from silver_canonical layer",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "mdm-exchange-rate",
        description: "Fetches quarterly average exchange rates from MDM for currency conversion",
      },
    ],
    dependencies: [
      { id: "silver-canonical-store", connector: "db" },
      { id: "mdm-exchange-rate", connector: "rest" },
      { id: "event-bus", connector: "async" },
      { id: "state-store", connector: "db" },
    ],
    risks: [
      "Exchange rate discrepancies between interim and final close runs can cause booking variances",
      "Dependency on MDM availability for exchange rates - fallback to cached rates required",
      "Complex saga coordination across EFR, CIL and IGR layers increases failure surface",
    ],
    diagram: { color: "#059669", shape: "rectangle" },
  },
  {
    id: "igr-calculation-service",
    name: "IGR Calculation Service",
    type: "microservice",
    status: "production",
    owner: "retro-platform-team",
    tags: ["core", "igr", "retrocession", "calculation"],
    description: {
      oneliner: "Internal Group Retrocession calculation engine for quota share arrangements",
      technical:
        "Stateless calculation microservice implementing the IGR (Internal Group Retrocession) business logic for Quota Share Retro (QSR) arrangements. Processes validated cashflow data, applies treaty terms and conditions (T&C), and computes QSR allocations. Supports multiple deal configurations (e.g., P&C and L&H). Runs on a scheduled basis (QSR Run) and produces output for downstream SICS booking.",
      business:
        "Automates the calculation of internal retrocession allocations between group entities (e.g., regional branches and reinsurance affiliates). Ensures compliance with treaty terms while eliminating manual spreadsheet-based calculations.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "API for triggering QSR calculation runs and retrieving results",
      },
      {
        direction: "provides",
        type: "async",
        description: "Publishes QSR run completion events with output summaries",
      },
      {
        direction: "consumes",
        type: "async",
        target: "event-bus",
        description: "Consumes validated cashflow events from Risk Adjustment pipeline",
      },
    ],
    dependencies: [
      { id: "state-store", connector: "db" },
      { id: "event-bus", connector: "async" },
      { id: "treaty-config-service", connector: "rest" },
    ],
    risks: [
      "Treaty terms misinterpretation can lead to incorrect allocations with financial impact",
      "QSR calculation depends on complete data from upstream RA pipeline - partial data produces wrong results",
      "Profit commission calculations for certain deals require manual override not yet supported",
    ],
    diagram: { color: "#2563EB", shape: "rectangle" },
  },
  {
    id: "mdm-exchange-rate",
    name: "MDM Exchange Rate Service",
    type: "external",
    status: "production",
    owner: "enterprise-data-team",
    tags: ["mdm", "exchange-rate", "master-data", "external"],
    description: {
      oneliner: "Master Data Management service providing official exchange rates for the insurance group",
      technical:
        "Enterprise MDM system serving as the single source of truth for FX rates across the organization. Provides quarterly average rates, daily spot rates, and custom reporting deadline rates (e.g., rates 10 business days before reporting deadlines). Exposes REST API with historical rate queries and supports both real-time and batch consumption. Data sourced from Bloomberg and Reuters feeds with internal validation.",
      business:
        "Provides authoritative exchange rates used across all financial reporting, treaty settlements, and regulatory submissions. Critical for ensuring consistent currency conversion across all business units and compliance with treaty-specific exchange rate requirements.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "REST API for querying quarterly average, daily spot, and custom-period exchange rates",
      },
      {
        direction: "provides",
        type: "async",
        description: "Publishes rate update events when new quarterly rates are finalized",
      },
    ],
    dependencies: [],
    risks: [
      "Stale or incorrect rates propagate to all downstream financial calculations",
      "Quarterly rate finalization timing creates a window where proxy rates must be used",
      "External market data feed outage can delay rate availability",
    ],
    diagram: { color: "#7C3AED", shape: "rectangle" },
  },
  {
    id: "silver-canonical-store",
    name: "Silver Canonical Data Store",
    type: "database",
    status: "production",
    owner: "data-engineering-team",
    tags: ["data-lake", "canonical", "silver-layer", "cashflow"],
    description: {
      oneliner: "Curated canonical data layer storing aggregated cashflow estimates for reinsurance",
      technical:
        "Databricks Delta Lake silver layer table (best_estimate_cashflow_aggregated) conforming to the enterprise canonical data model. Stores cleansed, validated and aggregated cashflow data from upstream bronze sources. Partitioned by quarter and business line (P&C, L&H). Implements slowly changing dimensions (SCD Type 2) for audit trail. Accessed via Databricks SQL endpoints and JDBC connectivity.",
      business:
        "The trusted, enterprise-wide source of aggregated cashflow data used for financial reporting, retrocession calculations, and regulatory submissions. Eliminates data inconsistencies by providing a single canonical view across all reporting consumers.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "db",
        description: "SQL access to best_estimate_cashflow_aggregated and related canonical tables",
      },
    ],
    dependencies: [],
    risks: [
      "Data quality issues in upstream bronze layer propagate to canonical tables",
      "Schema changes require coordinated migration across all consumers",
      "Late-arriving data can cause discrepancies in quarterly aggregations",
    ],
    diagram: { color: "#0891B2", shape: "cylinder" },
  },
  {
    id: "state-store",
    name: "State Store",
    type: "database",
    status: "production",
    owner: "retro-platform-team",
    tags: ["state-management", "monitoring", "tiger-schema", "operational"],
    description: {
      oneliner: "Operational state store tracking data load completeness and pipeline execution status",
      technical:
        "PostgreSQL database implementing the Tiger schema for pipeline state management. Tracks data arrival status from upstream sources (SS Data Arrived flag), monitors data load completeness, and maintains execution state for all pipeline runs. Supports the outbound monitoring pattern with configurable polling intervals (5-10 minutes). Provides optimistic locking for concurrent pipeline coordination.",
      business:
        "Ensures that financial reports and retrocession calculations only proceed when all required source data has been fully loaded, preventing incomplete or incorrect outputs that could impact regulatory submissions.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "db",
        description: "PostgreSQL access for pipeline state queries, data completeness checks, and run tracking",
      },
    ],
    dependencies: [],
    risks: [
      "State corruption can cause pipelines to skip data or re-process unnecessarily",
      "Polling-based monitoring adds latency to the overall pipeline execution",
      "Single point of coordination - unavailability blocks all downstream processing",
    ],
    diagram: { color: "#D97706", shape: "cylinder" },
  },
  {
    id: "risk-adjustment-processor",
    name: "Risk Adjustment Processor",
    type: "microservice",
    status: "production",
    owner: "actuarial-tech-team",
    tags: ["risk-adjustment", "cashflow", "data-pipeline", "core"],
    description: {
      oneliner: "Multi-stage data pipeline for consuming, transforming, and splitting cashflow data into risk adjustment tables",
      technical:
        "Kafka Streams application implementing a three-stage pipeline: (1) Consume Data from upstream sources with configurable conditions, (2) Transform Data applying business rules and currency conversions, (3) Split into Tables producing ul_ras_cashflow_header and ul_ras_cashflow_item output tables. Includes a scheduled Grace Validation step running daily at midnight to verify data completeness. Supports backpressure and exactly-once semantics.",
      business:
        "Processes raw cashflow data into structured risk adjustment outputs required for regulatory reporting and retrocession settlement. The daily grace validation ensures data integrity before downstream consumption by IGR and external retro calculations.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "async",
        description: "Produces ul_ras_cashflow_header and ul_ras_cashflow_item to downstream Kafka topics",
      },
      {
        direction: "provides",
        type: "rest",
        description: "Operational API for pipeline status, manual re-processing triggers, and health checks",
      },
      {
        direction: "consumes",
        type: "async",
        target: "event-bus",
        description: "Consumes raw cashflow events from EFR layer",
      },
      {
        direction: "consumes",
        type: "db",
        target: "state-store",
        description: "Reads and writes pipeline state and data completeness flags",
      },
    ],
    dependencies: [
      { id: "event-bus", connector: "async" },
      { id: "state-store", connector: "db" },
      { id: "cashflow-event-store", connector: "db" },
    ],
    risks: [
      "Grace validation failure at midnight blocks entire downstream pipeline until resolved",
      "Schema mismatch between header and item tables causes join failures in consumers",
      "High data volumes during quarterly close can cause processing lag",
    ],
    diagram: { color: "#0284C7", shape: "rectangle" },
  },
  {
    id: "cashflow-event-store",
    name: "Cashflow Event Store",
    type: "database",
    status: "production",
    owner: "retro-platform-team",
    tags: ["event-store", "cil", "cashflow", "secondary-store"],
    description: {
      oneliner: "Secondary event store in the CIL layer persisting cashflow events for audit and replay",
      technical:
        "Event store database (cashflow_entry schema) in the CIL (Central Integration Layer) providing durable storage for all cashflow events. Implements append-only event log with immutable entries for full audit trail. Supports event replay for reprocessing scenarios and temporal queries for point-in-time reconstruction. Uses PostgreSQL with BRIN indexes for efficient time-range queries on large event volumes.",
      business:
        "Provides complete audit trail of all cashflow data flowing through the retrocession pipeline. Enables regulatory auditors to trace any financial figure back to its source events and supports reprocessing when corrections are needed.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "db",
        description: "Read access for event replay, audit queries, and temporal data reconstruction",
      },
      {
        direction: "consumes",
        type: "async",
        target: "event-bus",
        description: "Subscribes to cashflow events from Risk Adjustment pipeline for persistence",
      },
    ],
    dependencies: [
      { id: "event-bus", connector: "async" },
    ],
    risks: [
      "Storage growth requires proactive capacity management - cashflow events are never deleted",
      "Replay of large event ranges can overwhelm downstream consumers without throttling",
      "Event schema versioning must be backward compatible to support historical replay",
    ],
    diagram: { color: "#9333EA", shape: "cylinder" },
  },
  {
    id: "treaty-config-service",
    name: "Treaty Configuration Service",
    type: "microservice",
    status: "production",
    owner: "retro-platform-team",
    tags: ["treaty", "configuration", "retrocession", "deal-management"],
    description: {
      oneliner: "Manages treaty terms, deal configurations, and retrocession arrangement parameters",
      technical:
        "Spring Boot microservice providing CRUD operations for treaty and deal configurations. Stores treaty terms including exchange rate definitions, threshold amounts, reporting deadlines, and profit commission rules. Supports versioned configurations with effective dating for treaty amendments. Manages deal IDs for both IGR (e.g., Quota Share Retro between group entities) and external retrocession (e.g., arrangements with third-party reinsurers).",
      business:
        "Central repository for all retrocession treaty parameters that drive automated calculations. Ensures that exchange rate approaches, settlement terms, and allocation rules are consistently applied across all processing runs without manual intervention.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "CRUD API for treaty terms, deal configurations, and exchange rate definitions",
      },
      {
        direction: "provides",
        type: "async",
        description: "Publishes treaty configuration change events for dependent services",
      },
      {
        direction: "provides",
        type: "human",
        description: "Admin UI for treaty managers to review and update deal parameters",
      },
    ],
    dependencies: [
      { id: "config-db", connector: "db" },
      { id: "event-bus", connector: "async" },
    ],
    risks: [
      "Incorrect treaty configuration directly impacts financial calculations with regulatory consequences",
      "Effective dating logic complexity - overlapping treaty versions can cause ambiguous lookups",
      "Manual profit commission rules for certain external deals are not yet captured in the system",
    ],
    diagram: { color: "#DC2626", shape: "rectangle" },
  },
  {
    id: "sics-booking-gateway",
    name: "SICS Booking Gateway",
    type: "gateway",
    status: "production",
    owner: "finance-integration-team",
    tags: ["sics", "accounting", "booking", "integration", "gateway"],
    description: {
      oneliner: "Integration gateway for posting retrocession entries to the SICS accounting system",
      technical:
        "Message-driven integration gateway that transforms retrocession calculation outputs into SICS-compatible booking entries. Implements idempotent posting with duplicate detection, batch processing for high-volume quarterly closes, and automatic reconciliation between posted and acknowledged entries. Supports both real-time and scheduled batch posting modes. Handles SICS-specific format requirements and validation rules.",
      business:
        "Final step in the retrocession pipeline that ensures all calculated amounts are accurately booked in the central accounting system (SICS). Critical for financial statement accuracy and regulatory reporting compliance.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "API for submitting booking requests, checking posting status, and reconciliation reports",
      },
      {
        direction: "consumes",
        type: "async",
        target: "event-bus",
        description: "Consumes QSR run completion events and RA output events for automatic posting",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "sics-core",
        description: "Posts booking entries to SICS via its internal API",
      },
    ],
    dependencies: [
      { id: "event-bus", connector: "async" },
      { id: "sics-core", connector: "rest" },
      { id: "redis-cache", connector: "db" },
    ],
    risks: [
      "SICS posting failures during quarterly close can delay financial statement preparation",
      "Exchange rate differences between manual client statements and SICS bookings need reconciliation",
      "Duplicate bookings due to retry logic failures would require manual SICS corrections",
    ],
    diagram: { color: "#EA580C", shape: "hexagon" },
  },
  {
    id: "sics-core",
    name: "SICS Accounting System",
    type: "external",
    status: "production",
    owner: "finance-systems-team",
    tags: ["accounting", "core-system", "legacy", "external", "sics"],
    description: {
      oneliner: "Central statutory and internal accounting system for the insurance group",
      technical:
        "Legacy enterprise accounting platform handling all statutory and internal booking entries. Supports multi-currency postings, intercompany settlements, and regulatory report generation. Exposes a proprietary API for automated booking integrations. Manages chart of accounts, cost centers, and legal entity hierarchies. Runs on a mainframe with batch processing windows.",
      business:
        "The system of record for all financial transactions in the insurance group. All retrocession settlements, risk adjustment entries, and intercompany transactions must ultimately be reflected in SICS for accurate financial reporting and regulatory compliance.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "Proprietary booking API for posting and querying accounting entries",
      },
      {
        direction: "provides",
        type: "file",
        description: "Batch file interface for bulk posting during quarterly close",
      },
    ],
    dependencies: [],
    risks: [
      "Legacy system with limited scalability during peak quarterly close periods",
      "Batch processing windows constrain real-time booking availability",
      "Any SICS downtime directly impacts financial closing deadlines",
    ],
    diagram: { color: "#78716C", shape: "rectangle" },
  },
]

async function seed() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000"

  console.log(`Seeding ${components.length} insurance components to ${baseUrl}...\n`)

  for (const component of components) {
    try {
      const res = await fetch(`${baseUrl}/api/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(component),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error(`✗ ${component.id}: ${res.status} – ${err}`)
      } else {
        console.log(`✓ ${component.id} (${component.name})`)
      }
    } catch (err) {
      console.error(`✗ ${component.id}: ${err}`)
    }
  }

  console.log("\nDone!")
}

seed()
