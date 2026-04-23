import fs from "node:fs";
import path from "node:path";
import type { RouteAdapter, RouteMatch, RouteResolverContext } from "../../sdk/src/index.js";

const PAGE_FILE_REGEX = /(?:^|\/)app\/(.*)\/page\.(t|j)sx?$/;
const IGNORED_SEGMENT_REGEX = /^\((.*)\)$/;

export function createNextAppAdapter(): RouteAdapter {
  return {
    id: "next-app",
    displayName: "Next.js App Router",
    canHandle(workspaceFiles: string[]) {
      return workspaceFiles.some((file) => normalize(file).includes("/app/") && /page\.(t|j)sx?$/.test(file));
    },
    async resolveRoutes(context: RouteResolverContext): Promise<RouteMatch[]> {
      const graph = buildImportGraph(context.workspaceFiles, context.workspaceRoot);
      const owners = findOwningPageFiles(context.reference.filePath, graph.reverseImports);

      return owners.map((owner) => {
        const routePath = pageFileToRoute(owner);
        return {
          id: `next-app:${routePath}:${owner}`,
          routePath,
          displayName: routePath,
          sourceFile: owner,
          framework: "next-app",
          kind: owner === normalize(context.reference.filePath) ? "direct" : "transitive",
        } satisfies RouteMatch;
      });
    },
  };
}

type ImportGraph = {
  reverseImports: Map<string, Set<string>>;
};

function buildImportGraph(workspaceFiles: string[], workspaceRoot: string): ImportGraph {
  const reverseImports = new Map<string, Set<string>>();
  const fileSet = new Set(workspaceFiles.map(normalize));

  for (const file of workspaceFiles) {
    const importer = normalize(file);
    const text = readFileText(file);
    for (const specifier of extractImportSpecifiers(text)) {
      const resolved = resolveImportSpecifier(importer, specifier, fileSet, workspaceRoot);
      if (!resolved) continue;
      const importers = reverseImports.get(resolved) ?? new Set<string>();
      importers.add(importer);
      reverseImports.set(resolved, importers);
    }
  }

  return { reverseImports };
}

function findOwningPageFiles(startFile: string, reverseImports: Map<string, Set<string>>): string[] {
  const queue = [normalize(startFile)];
  const visited = new Set<string>();
  const owners = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (PAGE_FILE_REGEX.test(current)) {
      owners.add(current);
      continue;
    }

    for (const importer of reverseImports.get(current) ?? []) {
      if (!visited.has(importer)) queue.push(importer);
    }
  }

  return [...owners].sort();
}

function pageFileToRoute(filePath: string): string {
  const normalized = normalize(filePath);
  const match = normalized.match(PAGE_FILE_REGEX);
  if (!match) return "/";

  const routeSegments = match[1]
    .split("/")
    .filter(Boolean)
    .filter((segment) => !IGNORED_SEGMENT_REGEX.test(segment) && !segment.startsWith("@"));

  const routePath = `/${routeSegments.join("/")}`.replace(/\/+/g, "/");
  return routePath === "/" ? routePath : routePath.replace(/\/$/, "");
}

function extractImportSpecifiers(sourceText: string): string[] {
  const results = new Set<string>();
  const patterns = [
    /import\s+(?:[^"']+from\s+)?["']([^"']+)["']/g,
    /export\s+[^"']*from\s+["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      results.add(match[1]);
    }
  }

  return [...results];
}

function resolveImportSpecifier(importerFile: string, specifier: string, fileSet: Set<string>, workspaceRoot: string): string | undefined {
  if (specifier.startsWith(".")) {
    return resolveFromBase(path.dirname(importerFile), specifier, fileSet);
  }

  if (specifier.startsWith("/")) {
    return resolveFromBase(workspaceRoot, `.${specifier}`, fileSet);
  }

  if (specifier.startsWith("@/")) {
    return resolveFromBase(workspaceRoot, `.${specifier.slice(1)}`, fileSet);
  }

  return undefined;
}

function resolveFromBase(baseDir: string, specifier: string, fileSet: Set<string>): string | undefined {
  const target = normalize(path.resolve(baseDir, specifier));
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    `${target}.jsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
    `${target}/index.js`,
    `${target}/index.jsx`,
  ];

  return candidates.find((candidate) => fileSet.has(candidate));
}

function readFileText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalize(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}
