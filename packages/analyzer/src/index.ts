import ts from "typescript";
import type { ReferencePoint, RouteAdapter, RouteMatch } from "../../sdk/src/index.js";

export type AnalyzeRoutesOptions = {
  workspaceRoot: string;
  fileName: string;
  position: number;
  workspaceFiles: string[];
  adapters: RouteAdapter[];
};

export async function analyzeRoutesForSymbol(options: AnalyzeRoutesOptions): Promise<RouteMatch[]> {
  const safeFiles = options.workspaceFiles.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  const program = createProgram(safeFiles);
  const sourceFile = program.getSourceFile(options.fileName);
  if (!sourceFile) return [];

  const node = findNodeAtPosition(sourceFile, options.position);
  if (!node) return [];

  const checker = program.getTypeChecker();
  const initialSymbol = safely(() => checker.getSymbolAtLocation(node));
  const symbol = resolveAliasedSymbol(checker, initialSymbol);
  if (!symbol) return [];

  const references = collectReferences(program, checker, symbol);
  const matches: RouteMatch[] = [];

  for (const adapter of options.adapters.filter((candidate) => safely(() => candidate.canHandle(options.workspaceFiles)) ?? false)) {
    for (const reference of references) {
      const resolved = await safelyAsync(() =>
        adapter.resolveRoutes({
          workspaceRoot: options.workspaceRoot,
          reference,
          workspaceFiles: options.workspaceFiles,
        }),
      );
      if (resolved?.length) matches.push(...resolved);
    }
  }

  return dedupeMatches(matches);
}

function createProgram(fileNames: string[]): ts.Program {
  return ts.createProgram(fileNames, {
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    noResolve: false,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
}

function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    const start = safely(() => node.getStart(sourceFile)) ?? node.pos;
    const end = node.end;
    if (position >= start && position <= end) {
      found = node;
      node.forEachChild(visit);
    }
  };
  visit(sourceFile);
  return found;
}

function collectReferences(program: ts.Program, checker: ts.TypeChecker, symbol: ts.Symbol): ReferencePoint[] {
  const references: ReferencePoint[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      const nodeSymbol = resolveAliasedSymbol(checker, safely(() => checker.getSymbolAtLocation(node)));
      if (nodeSymbol && nodeSymbol === symbol) {
        const start = safely(() => node.getStart(sourceFile)) ?? node.pos;
        const position = sourceFile.getLineAndCharacterOfPosition(start);
        references.push({
          filePath: sourceFile.fileName,
          line: position.line + 1,
          column: position.character + 1,
        });
      }
      node.forEachChild(visit);
    };
    safely(() => sourceFile.forEachChild(visit));
  }

  return references;
}

function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (!symbol) return undefined;
  return safely(() => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol));
}

function dedupeMatches(matches: RouteMatch[]): RouteMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.framework}:${match.routePath}:${match.sourceFile}:${match.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

async function safelyAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}
