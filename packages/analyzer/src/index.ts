import fs from "node:fs";
import path from "node:path";
import type { ImportGraph } from "../../sdk/src/index.js";

export function buildImportGraph(workspaceFiles: string[], workspaceRoot: string): ImportGraph {
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

export function expandTransitively(startFiles: string[], graph: ImportGraph): string[] {
  const queue = [...new Set(startFiles.map(normalize))];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const importer of graph.reverseImports.get(current) ?? []) {
      if (!visited.has(importer)) queue.push(importer);
    }
  }

  return [...visited];
}

function extractImportSpecifiers(sourceText: string): string[] {
  const results = new Set<string>();
  const patterns = [
    /import\s+(?:[^"']+from\s+)?["']([^"']+)["']/g,
    /export\s+[^"']*from\s+["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
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
