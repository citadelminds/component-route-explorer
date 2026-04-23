import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { analyzeRoutesForSymbol } from "../../../packages/analyzer/src/index.js";
import { createNextAppAdapter } from "../../../packages/adapter-next-app/src/index.js";
import { createReactRouterAdapter } from "../../../packages/adapter-react-router/src/index.js";

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
        const offset = editor.document.offsetAt(editor.selection.active);
        const matches = await analyzeRoutesForSymbol({
          workspaceRoot: workspaceFolder.uri.fsPath,
          fileName: editor.document.uri.fsPath,
          position: offset,
          workspaceFiles,
          adapters: [createNextAppAdapter(), createReactRouterAdapter()],
        });

        if (matches.length === 0) {
          vscode.window.showInformationMessage("No routes found for the selected component yet.");
          return;
        }

        const selected = await vscode.window.showQuickPick<{
          label: string;
          description: string;
          match: (typeof matches)[number];
        }>(
          matches.map((match) => ({
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

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
