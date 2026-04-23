import path from "node:path";
import type { RouteAdapter, RouteMatch, RouteResolverContext } from "../../sdk/src/index.js";

const PAGE_FILE_REGEX = /(?:^|\/)app(?:\/(.*))?\/page\.(t|j)sx?$/;
const IGNORED_SEGMENT_REGEX = /^\((.*)\)$/;

export function createNextAppAdapter(): RouteAdapter {
  return {
    id: "next-app",
    displayName: "Next.js App Router",
    canHandle(workspaceFiles: string[]) {
      return workspaceFiles.some((file) => normalize(file).includes("/app") && /page\.(t|j)sx?$/.test(file));
    },
    async resolveRoutes(context: RouteResolverContext): Promise<RouteMatch[]> {
      const normalized = normalize(context.reference.filePath);
      if (!PAGE_FILE_REGEX.test(normalized)) return [];

      const routePath = pageFileToRoute(normalized);
      return [
        {
          id: `next-app:${routePath}:${normalized}`,
          routePath,
          displayName: routePath,
          sourceFile: normalized,
          framework: "next-app",
          kind: normalized === normalize(context.reference.filePath) ? "direct" : "transitive",
        },
      ];
    },
  };
}

function pageFileToRoute(filePath: string): string {
  const match = filePath.match(PAGE_FILE_REGEX);
  const raw = match?.[1] ?? "";
  const routeSegments = raw
    .split("/")
    .filter(Boolean)
    .filter((segment) => !IGNORED_SEGMENT_REGEX.test(segment) && !segment.startsWith("@"));

  const routePath = `/${routeSegments.join("/")}`.replace(/\/+/g, "/");
  return routePath === "/" ? routePath : routePath.replace(/\/$/, "");
}

function normalize(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}
