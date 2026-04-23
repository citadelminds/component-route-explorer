# Component Route Explorer

Open source Cursor and VS Code extension for finding which application routes use a component, then opening those routes in the browser.

## Current milestone

Local testable MVP for Next.js App Router projects.

What works now:
- editor command: `Show Routes Using This Component`
- finds symbol references
- maps component usage up to owning Next app routes
- opens selected route in the browser
- extension architecture supports router adapters

Still in progress:
- React Router hardening
- richer handling for dynamic route examples
- extension publishing polish

## Monorepo layout

- `apps/extension`, extension package
- `packages/analyzer`, symbol lookup and route resolution core
- `packages/adapter-next-app`, Next.js App Router resolver
- `packages/adapter-react-router`, React Router resolver
- `packages/sdk`, public adapter API

## Local development

```bash
bun install
bun run build
```

## Package a local extension

```bash
cd apps/extension
bun run package
```

This produces a local `.vsix` file:

```bash
apps/component-route-explorer-0.1.0.vsix
```

Install it in Cursor or VS Code with:
- Extensions panel
- `...` menu
- `Install from VSIX...`

## How to test the MVP

1. Open a Next.js app-router project in Cursor
2. Open a component file
3. Put the cursor on the component symbol
4. Run `Show Routes Using This Component`
5. Pick a route from the list
6. The extension opens the matching local route in the browser

## Notes on Next support

Current route mapping handles:
- `app/page.tsx` to `/`
- nested pages like `app/dashboard/page.tsx` to `/dashboard`
- route groups like `app/(marketing)/about/page.tsx` to `/about`
- parallel route slot folders are ignored in URL output
- dynamic segments stay literal for now, for example `/blog/[slug]`

## Open source direction

The project is being designed so other people can add router adapters instead of modifying the core extension.
