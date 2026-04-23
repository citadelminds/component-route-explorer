import path from "node:path";
import type { RouteAdapter, RouteMatch, RouteResolverContext } from "../../sdk/src/index.js";

const PAGE_FILE_PATTERN = /app\/(.*)\/page\.(t|j)sx?$/;

export function createNextAppAdapter(): RouteAdapter {
  return {
    id: "next-app",
    displayName: "Next.js App Router",
    canHandle(workspaceFiles) {
      return workspaceFiles.some((file) => file.includes(`${path.sep}app${path.sep}`) && /page\.(t|j)sx?$/.test(file));
    },
    async resolveRoutes(context: RouteResolverContext): Promise<RouteMatch[]> {
      const normalized = context.reference.filePath.replaceAll(path.sep, "/");
      const directMatch = normalized.match(PAGE_FILE_PATTERN);
      if (!directMatch) return [];

      const routePath = `/${directMatch[1]}`.replace(/\/page$/, "").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
      return [
        {
          id: `next-app:${routePath}:${context.reference.filePath}`,
          routePath,
          displayName: routePath,
          sourceFile: context.reference.filePath,
          framework: "next-app",
          kind: "direct",
        },
      ];
    },
  };
}
