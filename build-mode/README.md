# Lodge BUILD

This folder now contains a `BUILD`-only app slice for Lodge.

## Included

- Backend scoring for:
  - spatiotemporal anchor matching
  - invitation synthesis
  - routine entropy detection
  - compatibility friction scoring
  - silent bridge notifications
- A lightweight Node server for local demo use
- A frontend with:
  - a live landing page
  - an animated globe-style hero
  - an interactive map for nearby ritual posts
  - a composer for new BUILD posts
  - blueprint and match detail panels

## Run

```powershell
node .\build-mode\src\server.js
```

Or:

```powershell
npm --prefix .\build-mode start
```

Then open:

```text
http://localhost:3030
```

Pages:

```text
/        landing page
/build   BUILD workspace
```

## Other Commands

```powershell
node .\build-mode\src\example.js
node .\build-mode\tests\routineMatchmaker.test.js
```

## Structure

- `src/server.js`
  Static file server plus JSON and SSE endpoints for the demo app.
- `src/demoBuildApp.js`
  BUILD app runtime, live updates, and plan generation.
- `src/buildModeDataStore.js`
  Loads configurable seed data and persists runtime posts to disk.
- `data/build-mode.seed.json`
  App seed/config for brand copy, map places, composer defaults, routines, and posts.
- `ui/`
  Frontend landing page and BUILD workspace.
- `src/buildModeService.js`
  Blueprint, match, share-link, and notification orchestration.
- `sql/schema.sql`
  Starter schema for a fuller persistent backend.
