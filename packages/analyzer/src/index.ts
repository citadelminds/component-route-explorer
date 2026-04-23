import fs from "node:fs";
import path from "node:path";
import type { ImportGraph } from "../../sdk/src/index.js";

export function buildImportGraph(workspaceFiles: string[], workspaceRoot: string): ImportGraph {
  const reverseImports = new Map<string, Set<string>>();
  const fileSet = new Set(workspaceFiles.map(normalize));
  const aliasRoots = getAliasRoots(workspaceRoot);

  for (const file of workspaceFiles) {
    const importer = normalize(file);
    const text = readFileText(file);
    for (const specifier of extractImportSpecifiers(text)) {
      const resolved = resolveImportSpecifier(importer, specifier, fileSet, workspaceRoot, aliasRoots);
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

function resolveImportSpecifier(importerFile: string, specifier: string, fileSet: Set<string>, workspaceRoot: string, aliasRoots: string[]): string | undefined {
  if (specifier.startsWith(".")) {
    return resolveFromBase(path.dirname(importerFile), specifier, fileSet);
  }

  if (specifier.startsWith("/")) {
    return resolveFromBase(workspaceRoot, `.${specifier}`, fileSet);
  }

  if (specifier.startsWith("@/")) {
    for (const aliasRoot of aliasRoots) {
      const resolved = resolveAliasSpecifier(aliasRoot, specifier, fileSet);
      if (resolved) return resolved;
    }
    return undefined;
  }

  return undefined;
}


function resolveAliasSpecifier(aliasRoot: string, specifier: string, fileSet: Set<string>): string | undefined {
  const withoutPrefix = specifier.replace(/^@\//, "");
  return resolveFromBase(aliasRoot, withoutPrefix, fileSet) ?? resolveFromBase(aliasRoot, `./${withoutPrefix}`, fileSet);
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


function getAliasRoots(workspaceRoot: string): string[] {
  const roots = [workspaceRoot, path.join(workspaceRoot, "src")];

  try {
    const tsconfigPath = path.join(workspaceRoot, "tsconfig.json");
    const raw = fs.readFileSync(tsconfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const paths = parsed?.compilerOptions?.paths;
    const aliases = paths?.["@/*"];

    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        const cleaned = String(alias).replace(/\*+$/g, "").replace(/\/$/, "");
        roots.push(path.resolve(workspaceRoot, cleaned));
        roots.push(path.resolve(workspaceRoot, cleaned.replace(/^\.\//, "")));
      }
    }
  } catch {}

  return [...new Set(roots.map(normalize))];
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
