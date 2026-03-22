export interface ComponentInterface {
  direction: "provides" | "consumes"
  type: "rest" | "grpc" | "async" | "db" | "file" | "human"
  target?: string
  description: string
}

export interface ComponentDependency {
  id: string
  connector: "rest" | "grpc" | "async" | "db" | "file" | "human"
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
  dependencies: ComponentDependency[]
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
