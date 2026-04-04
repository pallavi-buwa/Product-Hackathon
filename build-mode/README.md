# Lodge Build Mode

This folder contains an isolated backend-first implementation of the Build Mode "Routine Matchmaker" engine from the Lodge spec.

## Included

- Dual-vector distribution engine:
  - `symmetry` matches on routine alignment and temporal overlap
  - `proximity` matches on users within a 0.5-mile radius
- OpenAI-backed low-stakes invitation synthesis
- Entropy helper for prioritizing users whose routines are slipping
- UUID-based anchor link generator
- SQL schema starter for `User_Routines`, `Active_Intentions`, and `Matches`
- In-memory repository and tests for local verification

## Structure

- `src/routineMatchmaker.js`
  Core engine that finds matches, deduplicates users, prioritizes recipients, and generates invitation copy.
- `src/invitationSynthesizer.js`
  OpenAI Responses API client plus a deterministic template fallback for local testing.
- `src/entropy.js`
  Rolling-window entropy detector for "Recommended for your routine" prioritization.
- `src/anchorLink.js`
  UUID link helper for single-purpose share pages.
- `sql/schema.sql`
  Postgres/PostGIS-oriented starter schema.

## Environment

To use the OpenAI synthesizer, set:

```powershell
$env:OPENAI_API_KEY="your_api_key"
$env:OPENAI_MODEL="gpt-4.1-mini"
```

If no API key is present, the example uses a template synthesizer so the matchmaker can still be exercised locally.

## Run

```powershell
node .\build-mode\src\example.js
node .\build-mode\tests\routineMatchmaker.test.js
```

## Notes

- No UI is generated in this module.
- Everything is kept in `build-mode/` so it can be integrated into a larger React or Next.js app later.
- The schema adds `routine_tags` and `activity_history` support because the Build Mode symmetry logic depends on more than a single routine type.


