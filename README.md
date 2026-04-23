# Component Route Explorer

Open source Cursor / VS Code extension for finding which application routes use a component, then opening those routes in the browser.

## MVP goals

- Find symbol references for the selected component
- Resolve owning routes for Next.js App Router and React Router
- Show a pick list in the editor
- Open the selected route in the browser
- Keep framework support extensible via adapters

## Monorepo layout

- `apps/extension` - Cursor / VS Code extension
- `packages/analyzer` - symbol lookup and route resolution core
- `packages/adapter-next-app` - Next.js App Router resolver
- `packages/adapter-react-router` - React Router resolver
- `packages/sdk` - public adapter API

## Status

Scaffolding MVP.
