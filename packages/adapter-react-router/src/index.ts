import fs from "node:fs/promises";
import path from "node:path";
import type { RouteAdapter, RouteMatch, RouteResolverContext } from "../../sdk/src/index.js";

const ROUTE_PATTERN = /path\s*:\s*["'`]([^"'`]+)["'`]/g;

export function createReactRouterAdapter(): RouteAdapter {
  return {
    id: "react-router",
    displayName: "React Router",
    canHandle(workspaceFiles) {
      return workspaceFiles.some((file) => /router|routes/i.test(path.basename(file)));
    },
    async resolveRoutes(context: RouteResolverContext): Promise<RouteMatch[]> {
      const directory = path.dirname(context.reference.filePath);
      const candidates = [
        path.join(directory, "routes.tsx"),
        path.join(directory, "routes.ts"),
        path.join(directory, "router.tsx"),
        path.join(directory, "router.ts"),
      ];

      const matches: RouteMatch[] = [];
      for (const candidate of candidates) {
        try {
          const content = await fs.readFile(candidate, "utf8");
          for (const match of content.matchAll(ROUTE_PATTERN)) {
            const routePath = match[1];
            matches.push({
              id: `react-router:${routePath}:${candidate}`,
              routePath,
              displayName: routePath,
              sourceFile: candidate,
              framework: "react-router",
              kind: "transitive",
            });
          }
        } catch {
          continue;
        }
      }

      return matches;
    },
  };
}
