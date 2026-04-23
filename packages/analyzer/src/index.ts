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
  const program = createProgram(options.workspaceFiles);
  const sourceFile = program.getSourceFile(options.fileName);
  if (!sourceFile) return [];

  const node = findNodeAtPosition(sourceFile, options.position);
  if (!node) return [];

  const symbol = program.getTypeChecker().getSymbolAtLocation(node);
  if (!symbol) return [];

  const references = collectReferences(program, symbol);
  const matches: RouteMatch[] = [];

  for (const adapter of options.adapters.filter((candidate) => candidate.canHandle(options.workspaceFiles))) {
    for (const reference of references) {
      const resolved = await adapter.resolveRoutes({
        workspaceRoot: options.workspaceRoot,
        reference,
      });
      matches.push(...resolved);
    }
  }

  return dedupeMatches(matches);
}

function createProgram(fileNames: string[]): ts.Program {
  return ts.createProgram(fileNames, {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });
}

function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (position >= node.getStart() && position <= node.getEnd()) {
      found = node;
      node.forEachChild(visit);
    }
  };
  visit(sourceFile);
  return found;
}

function collectReferences(program: ts.Program, symbol: ts.Symbol): ReferencePoint[] {
  const references: ReferencePoint[] = [];
  const checker = program.getTypeChecker();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      const nodeSymbol = checker.getSymbolAtLocation(node);
      if (nodeSymbol && nodeSymbol === symbol) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        references.push({
          filePath: sourceFile.fileName,
          line: position.line + 1,
          column: position.character + 1,
        });
      }
      node.forEachChild(visit);
    };
    sourceFile.forEachChild(visit);
  }

  return references;
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
