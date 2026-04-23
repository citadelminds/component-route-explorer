# Component Route Explorer

Open source Cursor and VS Code extension for finding which application routes use a component, then opening those routes in the browser.

## What it does

- Find symbol references for the selected component
- Resolve owning routes for Next.js App Router and React Router
- Show a pick list in the editor
- Open the selected route in the browser
- Stay extensible through router adapters

## Current status

Active MVP.

Today the strongest path is:
- Next.js App Router first
- React Router support second
- public packaging after route resolution feels reliable

## Monorepo layout

- `apps/extension` , Cursor and VS Code extension
- `packages/analyzer` , symbol lookup and route resolution core
- `packages/adapter-next-app` , Next.js App Router resolver
- `packages/adapter-react-router` , React Router resolver
- `packages/sdk` , public adapter API

## Local development

```bash
bun install
bun run build
```

## Planned commands

- `Show Routes Using This Component`
- open selected route in browser
- later: copy route list
- later: open all routes
- later: direct vs transitive usage modes

## Open source direction

The project is being designed so other people can extend it by adding router adapters instead of changing the core extension.
