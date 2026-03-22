import type { Component } from "../src/lib/types"

const components: Component[] = [
  {
    id: "api-gateway",
    name: "API Gateway",
    type: "gateway",
    status: "production",
    owner: "platform-team",
    tags: ["core", "networking", "security", "ingress"],
    description: {
      oneliner: "Centrálny vstupný bod pre všetky API požiadavky",
      technical:
        "Kong-based API gateway s rate limiting, JWT validáciou, request/response transformáciami a circuit breaker patternom. Beží ako Kubernetes Ingress controller s horizontálnym škálovaním. Podporuje canary deployments a A/B routing.",
      business:
        "Zabezpečuje, že všetky externé a interné požiadavky na systém prechádzajú cez jeden kontrolovaný bod, čo zvyšuje bezpečnosť a umožňuje monitoring celkového trafficu.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "Proxy pre všetky downstream REST API endpointy",
      },
      {
        direction: "provides",
        type: "grpc",
        description: "gRPC reverse proxy pre interné služby",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "identity-service",
        description: "Validácia JWT tokenov a session management",
      },
    ],
    dependencies: [
      { id: "identity-service", connector: "rest" },
      { id: "redis-cache", connector: "db" },
      { id: "config-db", connector: "db" },
    ],
    risks: [
      "Single point of failure – výpadok gateway znamená výpadok celého systému",
      "Vysoký throughput vyžaduje pravidelné záťažové testy",
      "Konfigurácia routovacích pravidiel je komplexná a náchylná na chyby",
    ],
    diagram: { color: "#3B82F6", shape: "hexagon" },
  },
  {
    id: "identity-service",
    name: "Identity & Access Management",
    type: "microservice",
    status: "production",
    owner: "security-team",
    tags: ["security", "auth", "core", "compliance"],
    description: {
      oneliner: "Správa identít, autentifikácie a autorizácie používateľov",
      technical:
        "OAuth 2.0 / OpenID Connect provider postavený na Keycloak s custom SPI pluginmi. Podporuje SAML 2.0 federation pre enterprise SSO, MFA cez TOTP a WebAuthn, RBAC s hierarchickými rolami a ABAC policies. Ukladá identity do PostgreSQL, sessions do Redis.",
      business:
        "Zabezpečuje, že do systému majú prístup iba oprávnení používatelia s overenými identitami. Podporuje firemné SSO a viacfaktorové overenie podľa compliance požiadaviek.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "OAuth 2.0 endpointy – /authorize, /token, /userinfo, /introspect",
      },
      {
        direction: "provides",
        type: "rest",
        description: "Admin REST API pre správu používateľov, rolí a klientov",
      },
      {
        direction: "provides",
        type: "async",
        description: "Eventy pri login, logout, zmene role (Kafka topic: identity.events)",
      },
    ],
    dependencies: [
      { id: "user-db", connector: "db" },
      { id: "redis-cache", connector: "db" },
      { id: "notification-service", connector: "async" },
    ],
    risks: [
      "Kompromitácia tejto služby ohrozuje celý systém – vyžaduje pravidelný security audit",
      "Migrácia identity providera je vysoko riziková a komplexná",
      "GDPR – ukladanie PII vyžaduje šifrovanie at-rest a audit log",
    ],
    diagram: { color: "#EF4444", shape: "rectangle" },
  },
  {
    id: "customer-portal",
    name: "Customer Portal",
    type: "frontend",
    status: "production",
    owner: "frontend-team",
    tags: ["frontend", "customer-facing", "ux"],
    description: {
      oneliner: "Webová aplikácia pre zákazníkov na správu účtu a služieb",
      technical:
        "Next.js 14 aplikácia s App Router, server-side rendering a React Server Components. Používa Tailwind CSS + shadcn/ui design system. Stav riadený cez TanStack Query s optimistic updates. Monitoring cez Sentry, analytics cez Segment.",
      business:
        "Hlavný digitálny kanál pre zákazníkov, kde si spravujú účet, prezerajú faktúry, podávajú požiadavky a komunikujú s podporou. Priamo ovplyvňuje zákaznícku spokojnosť a retenciu.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "human",
        description: "Webové rozhranie pre zákazníkov (responsive, WCAG 2.1 AA)",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "api-gateway",
        description: "Všetky API volania cez centrálny gateway",
      },
    ],
    dependencies: [
      { id: "api-gateway", connector: "rest" },
      { id: "identity-service", connector: "rest" },
      { id: "cdn-service", connector: "rest" },
    ],
    risks: [
      "XSS a CSRF zraniteľnosti – vyžaduje pravidelné penetračné testy",
      "Výpadok portálu priamo ovplyvňuje zákaznícku skúsenosť a NPS",
      "Veľké bundle size môže spôsobiť pomalé načítanie na slabších zariadeniach",
    ],
    diagram: { color: "#8B5CF6", shape: "rectangle" },
  },
  {
    id: "order-service",
    name: "Order Management Service",
    type: "microservice",
    status: "production",
    owner: "commerce-team",
    tags: ["core", "business-logic", "transactions"],
    description: {
      oneliner: "Spracovanie a riadenie životného cyklu objednávok",
      technical:
        "Java 21 / Spring Boot 3 microservice implementujúci Saga pattern pre distribuované transakcie. Stavový automat objednávky (created → confirmed → processing → shipped → delivered / cancelled). Event sourcing s CQRS pre audit trail. Horizontálne škálovateľný, beží v Kubernetes.",
      business:
        "Jadro obchodného procesu – spravuje celý životný cyklus objednávky od vytvorenia cez platbu až po doručenie. Kritický pre revenue a zákaznícku spokojnosť.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "CRUD API pre objednávky s filtrovaním, stránkovaním a full-text search",
      },
      {
        direction: "provides",
        type: "async",
        description: "Doménové eventy (order.created, order.confirmed, order.shipped) na Kafka",
      },
      {
        direction: "consumes",
        type: "async",
        target: "payment-service",
        description: "Počúva payment.completed a payment.failed eventy",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "inventory-service",
        description: "Overenie dostupnosti produktov pred potvrdením objednávky",
      },
    ],
    dependencies: [
      { id: "order-db", connector: "db" },
      { id: "payment-service", connector: "async" },
      { id: "notification-service", connector: "async" },
      { id: "event-bus", connector: "async" },
    ],
    risks: [
      "Strata objednávky znamená priamu finančnú stratu – vyžaduje exactly-once processing",
      "Saga rollback môže zlyhať a vytvoriť inkozistentný stav",
      "Vysoká záťaž počas sezónnych špičiek (Black Friday, Vianoce)",
    ],
    diagram: { color: "#F59E0B", shape: "rectangle" },
  },
  {
    id: "payment-service",
    name: "Payment Processing Service",
    type: "microservice",
    status: "production",
    owner: "fintech-team",
    tags: ["core", "financial", "pci-dss", "compliance"],
    description: {
      oneliner: "Spracovanie platieb, refundov a finančných transakcií",
      technical:
        "Go microservice v PCI DSS Level 1 compliant prostredí. Integruje Stripe, PayPal a bankové prevody cez adapter pattern. Idempotentné spracovanie s deduplication key. Dvojfázový commit pre kritické transakcie. Citlivé dáta šifrované cez AWS KMS, žiadne PAN dáta v logoch.",
      business:
        "Zabezpečuje bezpečné a spoľahlivé spracovanie platieb od zákazníkov. Podporuje viaceré platobné metódy a automatické refundy. Priamo ovplyvňuje cash flow a compliance.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "Payment API – initiate, capture, refund, status",
      },
      {
        direction: "provides",
        type: "async",
        description: "Eventy payment.completed, payment.failed, refund.processed na Kafka",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "stripe-api",
        description: "Stripe API pre kartové platby",
      },
    ],
    dependencies: [
      { id: "payment-db", connector: "db" },
      { id: "stripe-api", connector: "rest" },
      { id: "event-bus", connector: "async" },
      { id: "redis-cache", connector: "db" },
    ],
    risks: [
      "PCI DSS non-compliance môže viesť k strate licencie na spracovanie platieb",
      "Double-charge scenár pri network timeout – idempotencia je kritická",
      "Výpadok payment providera vyžaduje automatický failover",
    ],
    diagram: { color: "#10B981", shape: "rectangle" },
  },
  {
    id: "notification-service",
    name: "Notification Service",
    type: "microservice",
    status: "production",
    owner: "platform-team",
    tags: ["platform", "messaging", "email", "sms", "push"],
    description: {
      oneliner: "Centralizovaný systém pre odosielanie notifikácií cez všetky kanály",
      technical:
        "Node.js microservice s template engine (Handlebars) a channel routing. Podporuje email (SendGrid), SMS (Twilio), push notifikácie (Firebase), in-app a webhook. Priority queue s rate limiting per channel. Retry mechanizmus s exponential backoff. Delivery tracking a bounce handling.",
      business:
        "Zabezpečuje spoľahlivé doručenie transačných a marketingových správ zákazníkom. Unifikuje komunikačné kanály a umožňuje business tímom spravovať šablóny bez zásahu vývojárov.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "REST API pre priame odoslanie notifikácie a správu šablón",
      },
      {
        direction: "consumes",
        type: "async",
        target: "event-bus",
        description: "Počúva doménové eventy a triggeruje príslušné notifikácie",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "sendgrid-api",
        description: "SendGrid API pre odosielanie emailov",
      },
    ],
    dependencies: [
      { id: "notification-db", connector: "db" },
      { id: "event-bus", connector: "async" },
      { id: "redis-cache", connector: "db" },
    ],
    risks: [
      "Spam protection – chybná konfigurácia môže spôsobiť masové odosielanie",
      "Email deliverability závisí od reputácie domény a SPF/DKIM konfigurácie",
      "GDPR – musí rešpektovať opt-out preferencie zákazníkov",
    ],
    diagram: { color: "#EC4899", shape: "rectangle" },
  },
  {
    id: "event-bus",
    name: "Enterprise Event Bus",
    type: "queue",
    status: "production",
    owner: "platform-team",
    tags: ["core", "infrastructure", "messaging", "kafka"],
    description: {
      oneliner: "Centrálna message broker platforma pre asynchrónnu komunikáciu",
      technical:
        "Apache Kafka cluster (3 brokery, 3 ZooKeeper nody) s Confluent Schema Registry pre Avro schémy. Replication factor 3, min.insync.replicas=2. Retenčná politika 7 dní pre väčšinu topicov, 90 dní pre audit topicy. Kafka Connect pre CDC z databáz. Monitoring cez Confluent Control Center.",
      business:
        "Umožňuje jednotlivým systémom komunikovať asynchrónne a nezávisle, čo zvyšuje odolnosť celého systému voči výpadkom. Zabezpečuje, že žiadna správa sa nestratí.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "async",
        description: "Kafka topics pre publish/subscribe messaging s guaranteed delivery",
      },
      {
        direction: "provides",
        type: "rest",
        description: "Schema Registry REST API pre registráciu a validáciu schém",
      },
    ],
    dependencies: [],
    risks: [
      "Výpadok Kafka clustra ovplyvní všetku asynchrónnu komunikáciu v systéme",
      "Schema evolution musí byť backward compatible, inak zlomí konzumentov",
      "Disk space – bez monitoringu môže retenčná politika zaplniť storage",
    ],
    diagram: { color: "#F97316", shape: "cylinder" },
  },
  {
    id: "user-db",
    name: "User Database",
    type: "database",
    status: "production",
    owner: "dba-team",
    tags: ["database", "postgresql", "core", "pii"],
    description: {
      oneliner: "Primárna databáza pre používateľské dáta a identity",
      technical:
        "PostgreSQL 16 s pgcrypto pre šifrovanie PII stĺpcov. Primary-replica setup s streaming replication a automatickým failoverom cez Patroni. Row-level security pre multi-tenant izoláciu. Automated backups každých 6 hodín do S3 s point-in-time recovery. Connection pooling cez PgBouncer.",
      business:
        "Uchováva všetky zákaznícke dáta vrátane osobných údajov. Podlieha prísnym bezpečnostným a compliance požiadavkám (GDPR, SOC 2). Dostupnosť tejto databázy je kritická pre fungovanie celého systému.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "db",
        description: "PostgreSQL wire protocol na porte 5432 cez PgBouncer pool",
      },
    ],
    dependencies: [],
    risks: [
      "Strata dát je katastrofický scenár – RPO musí byť < 1 hodina",
      "GDPR right to erasure vyžaduje kaskádové mazanie cez všetky závislé tabuľky",
      "Databázové migrácie na veľkých tabuľkách môžu spôsobiť lock contention",
    ],
    diagram: { color: "#06B6D4", shape: "cylinder" },
  },
  {
    id: "redis-cache",
    name: "Redis Cache Cluster",
    type: "database",
    status: "production",
    owner: "platform-team",
    tags: ["cache", "infrastructure", "performance", "redis"],
    description: {
      oneliner: "Distribuovaný in-memory cache a session store",
      technical:
        "Redis 7 Cluster s 6 nodmi (3 primary + 3 replica). Používaný ako cache (LRU eviction), session store (TTL 24h), rate limiter (sliding window), distributed lock (Redlock) a pub/sub pre real-time features. Maxmemory policy: allkeys-lru. Persistence: RDB snapshots každých 15 minút.",
      business:
        "Dramaticky zrýchľuje odozvu systému tým, že často používané dáta drží v pamäti. Znižuje záťaž na databázy a externé služby, čo šetrí náklady na infraštruktúru.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "db",
        description: "Redis protocol (RESP3) na porte 6379 – cache, sessions, locks, pub/sub",
      },
    ],
    dependencies: [],
    risks: [
      "Cache invalidation – nekonzistencia medzi cache a source of truth",
      "Memory pressure – bez monitoringu môže OOM killer zabiť Redis proces",
      "Thundering herd pri cache miss na populárny kľúč po expirácii",
    ],
    diagram: { color: "#DC2626", shape: "cylinder" },
  },
  {
    id: "monitoring-platform",
    name: "Observability Platform",
    type: "platform",
    status: "production",
    owner: "sre-team",
    tags: ["observability", "monitoring", "logging", "tracing", "alerting"],
    description: {
      oneliner: "Centrálna platforma pre monitoring, logging, tracing a alerting",
      technical:
        "Stack: Prometheus + Grafana pre metriky, ELK (Elasticsearch, Logstash, Kibana) pre logy, Jaeger pre distributed tracing. OpenTelemetry Collector ako unified ingestion point. PagerDuty integrácia pre on-call alerting. Custom Grafana dashboardy pre SLI/SLO tracking. Retenčná politika: metriky 90 dní, logy 30 dní, traces 7 dní.",
      business:
        "Poskytuje prehľad o zdraví a výkone celého systému v reálnom čase. Umožňuje rýchlu detekciu a diagnostiku problémov, čím minimalizuje dopad výpadkov na zákazníkov a business.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "human",
        description: "Grafana dashboardy a Kibana pre vizualizáciu a analýzu",
      },
      {
        direction: "provides",
        type: "rest",
        description: "Prometheus remote write API a OpenTelemetry OTLP endpoint",
      },
      {
        direction: "consumes",
        type: "rest",
        target: "pagerduty-api",
        description: "PagerDuty API pre eskaláciu alertov na on-call tím",
      },
    ],
    dependencies: [],
    risks: [
      "Výpadok monitoringu znamená, že ostatné výpadky zostanú nedetekované",
      "Vysoký objem logov môže spôsobiť nákladovú explóziu na Elasticsearch cluster",
      "Alert fatigue pri zle nastavených prahových hodnotách znižuje reakčnú dobu tímu",
    ],
    diagram: { color: "#6366F1", shape: "rectangle" },
  },
  {
    id: "stripe-api",
    name: "Stripe Payment Gateway",
    type: "external",
    status: "production",
    owner: "fintech-team",
    tags: ["external", "payments", "third-party", "pci-dss"],
    description: {
      oneliner: "Externý platobný provider pre kartové transakcie",
      technical:
        "Stripe API v2024-01 integrácia cez oficiálny SDK. Využíva Payment Intents API, Webhook endpointy pre asynchrónne notifikácie (payment_intent.succeeded, charge.refunded), Stripe Elements pre PCI-compliant frontend. Idempotency keys pre safe retries. Test/live mode switching cez environment variables.",
      business:
        "Hlavný platobný provider umožňujúci prijímanie kartových platieb (Visa, Mastercard, AMEX) a digitálnych peňaženiek (Apple Pay, Google Pay). Stripe znáša PCI DSS compliance záťaž pre kartové dáta.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "rest",
        description: "Stripe REST API – PaymentIntents, Refunds, Customers, Webhooks",
      },
    ],
    dependencies: [],
    risks: [
      "Vendor lock-in – migrácia na iného providera je nákladná a riziková",
      "Zmeny v Stripe API verzii môžu vyžadovať úpravy integrácie",
      "Výpadok Stripe blokuje všetky kartové platby – treba mať fallback plán",
    ],
    diagram: { color: "#635BFF", shape: "rectangle" },
  },
  {
    id: "shared-ui-library",
    name: "Shared UI Component Library",
    type: "library",
    status: "production",
    owner: "frontend-team",
    tags: ["frontend", "design-system", "reusable", "npm"],
    description: {
      oneliner: "Zdieľaná knižnica UI komponentov a design tokens",
      technical:
        "React component library buildovaná cez Vite v library mode, publikovaná ako privátny NPM balík (@company/ui). Založená na Radix UI primitívach s Tailwind CSS. Obsahuje 60+ komponentov, design tokens, ikony a utility hooks. Storybook pre dokumentáciu a vizuálne testy. Chromatic pre visual regression testing. Semantic versioning s changelogom.",
      business:
        "Zabezpečuje konzistentný vizuálny štýl a používateľský zážitok naprieč všetkými frontend aplikáciami. Zrýchľuje vývoj nových funkcionalít tým, že vývojári nemuselia vytvárať základné UI prvky od nuly.",
    },
    interfaces: [
      {
        direction: "provides",
        type: "file",
        description: "NPM balík @company/ui – React komponenty, hooks a design tokens",
      },
    ],
    dependencies: [],
    risks: [
      "Breaking change v knižnici sa propaguje do všetkých konzumujúcich aplikácií",
      "Príliš časté major verzie spomaľujú adopciu a vytvárajú version drift",
      "Accessibility regresia v zdieľanom komponente ovplyvní celú organizáciu",
    ],
    diagram: { color: "#A855F7", shape: "rectangle" },
  },
]

async function seed() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000"

  console.log(`Seeding ${components.length} components to ${baseUrl}...\n`)

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
