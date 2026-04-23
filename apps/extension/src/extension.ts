import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { buildImportGraph, expandTransitively } from "../../../packages/analyzer/src/index.js";
import { createNextAppAdapter } from "../../../packages/adapter-next-app/src/index.js";
import { createReactRouterAdapter } from "../../../packages/adapter-react-router/src/index.js";
import type { ReferencePoint, RouteMatch } from "../../../packages/sdk/src/index.js";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("componentRouteExplorer.showRoutesUsingComponent", async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("Open a component file and place the cursor on a symbol first.");
          return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
          vscode.window.showInformationMessage("Open a workspace folder first.");
          return;
        }

        const workspaceFiles = await collectWorkspaceFiles(workspaceFolder.uri.fsPath);
        const references = await findReferences(editor.document.uri, editor.selection.active);
        const documentSymbolFiles = await findDocumentSymbolContainerFiles(editor.document);
        const initialFiles = new Set<string>([
          editor.document.uri.fsPath,
          ...documentSymbolFiles,
          ...references.map((reference) => reference.uri.fsPath),
        ]);
        const graph = buildImportGraph(workspaceFiles, workspaceFolder.uri.fsPath);
        const transitiveFiles = expandTransitively([...initialFiles], graph);
        const debugEnabled = vscode.workspace.getConfiguration("componentRouteExplorer").get<boolean>("debug", false);

        const adapters = [createNextAppAdapter(), createReactRouterAdapter()].filter((adapter) => adapter.canHandle(workspaceFiles));
        const matches: RouteMatch[] = [];

        for (const filePath of transitiveFiles) {
          const referencePoint: ReferencePoint = {
            filePath,
            line: 1,
            column: 1,
          };

          for (const adapter of adapters) {
            try {
              const resolved = await adapter.resolveRoutes({
                workspaceRoot: workspaceFolder.uri.fsPath,
                reference: referencePoint,
                workspaceFiles,
              });
              matches.push(...resolved);
            } catch {
              continue;
            }
          }
        }

        const deduped = dedupeMatches(matches);

        if (debugEnabled) {
          const seedPreview = [...initialFiles].slice(0, 10).map((file) => path.relative(workspaceFolder.uri.fsPath, file)).join("\n") || "<none>";
          const transitivePreview = transitiveFiles.slice(0, 20).map((file) => path.relative(workspaceFolder.uri.fsPath, file)).join("\n") || "<none>";
          const routePreview = deduped.map((match) => `${match.routePath} <= ${path.relative(workspaceFolder.uri.fsPath, match.sourceFile)}`).join("\n") || "<none>";
          void vscode.window.showInformationMessage(`Seeds:
${seedPreview}

Transitive Files:
${transitivePreview}

Routes:
${routePreview}`);
        }
        if (deduped.length === 0) {
          vscode.window.showInformationMessage("No routes found for the selected component yet.");
          return;
        }

        const selected = await vscode.window.showQuickPick(
          deduped.map((match) => ({
            label: match.displayName,
            description: `${match.framework} • ${path.relative(workspaceFolder.uri.fsPath, match.sourceFile)}`,
            match,
          })),
          {
            title: "Routes using this component",
          },
        );

        if (!selected) return;

        const config = vscode.workspace.getConfiguration("componentRouteExplorer");
        const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
        const url = new URL(selected.match.routePath, ensureTrailingSlash(baseUrl)).toString();
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Component Route Explorer failed: ${message}`);
      }
    }),
  );
}

export function deactivate() {}

async function findDocumentSymbolContainerFiles(document: vscode.TextDocument): Promise<string[]> {
  const symbols = (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    document.uri,
  )) ?? [];

  if (symbols.length === 0) return [];
  return [document.uri.fsPath];
}

async function findReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
  const locations = (await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    position,
  )) ?? [];
  return locations.filter((location) => location.uri.scheme === "file");
}

async function collectWorkspaceFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results;
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

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
