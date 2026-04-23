export type RouteMatch = {
  id: string;
  routePath: string;
  displayName: string;
  sourceFile: string;
  framework: string;
  kind: "direct" | "transitive";
};

export type ReferencePoint = {
  filePath: string;
  line: number;
  column: number;
};

export type RouteResolverContext = {
  workspaceRoot: string;
  reference: ReferencePoint;
};

export interface RouteAdapter {
  id: string;
  displayName: string;
  canHandle(workspaceFiles: string[]): boolean;
  resolveRoutes(context: RouteResolverContext): Promise<RouteMatch[]>;
}
