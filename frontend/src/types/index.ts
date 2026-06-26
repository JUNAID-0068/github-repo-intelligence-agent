export interface Report {
  id: number
  repo_url: string
  repo_name: string
  language: string
  framework: string
  architecture_report: string
  documentation_report: string
  review_report: string
  dependency_report: string
  onboarding_report: string
  dependency_graph_json: string
  final_report: string
  status: string
  created_at: string
}

export interface AgentStatus {
  cloning: string
  parsing: string
  embedding: string
  architecture: string
  documentation: string
  review: string
  dependency: string
  onboarding: string
}

export interface StreamEvent {
  agent: string
  status: string
}

export interface DependencyNode {
  id: string
  version?: string
  /** "root" | "direct" | "transitive" | "dev" */
  type?: string
}

export interface DependencyEdge {
  from: string
  to: string
  /** "depends_on" | "dev_depends_on" */
  type?: string
}

export interface DependencyGraph {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
}
