export interface ComponentInterface {
  direction: "provides" | "consumes"
  type: "rest" | "grpc" | "async" | "db" | "file" | "human" | "info" | "link"
  target?: string
  description: string
}

export type RelationshipType =
  | "parent-of"
  | "child-of"
  | "depends-on"
  | "communicates-with"
  | "reads-from"
  | "writes-to"
  | "fallback"

export interface ComponentRelationship {
  target: string
  type: RelationshipType
  connector?: "rest" | "grpc" | "async" | "db" | "file" | "human" | "info" | "link"
  description?: string
}

export interface ComponentDiagram {
  color?: string
  shape?: string
}

export interface ComponentDescription {
  oneliner: string
  technical: string
  business: string
}

export type ComponentType =
  | "microservice"
  | "frontend"
  | "database"
  | "queue"
  | "gateway"
  | "external"
  | "platform"
  | "library"
  | "data-pipeline"
  | "storage"
  | "batch-job"
  | "cache"
  | "context"
  | "boundary"
  | "application"
  | "module"

export type ComponentStatus = "draft" | "production" | "deprecated"

export interface Component {
  id: string
  name: string
  type: ComponentType
  status: ComponentStatus
  owner: string
  tags: string[]
  description: ComponentDescription
  interfaces: ComponentInterface[]
  relationships: ComponentRelationship[]
  risks?: string[]
  diagram?: ComponentDiagram
}

export interface ComponentWithSha extends Component {
  sha: string
}

export interface Diagram {
  name: string
  content: string
}

export interface DiagramWithSha extends Diagram {
  sha: string
}
