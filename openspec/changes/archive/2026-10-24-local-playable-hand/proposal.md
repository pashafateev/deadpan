# Proposal

## Why

The table UI can display a hand, but its controls only switch between fake
scenarios. A complete hand played from two local browser tabs will prove the
connection between the chosen rules library, server authority, and the existing
UI before adding the rest of the backend.

## What Changes

- Use `@pokertools/engine@2.1.0` behind a server-side engine adapter. The user
  approved switching after `poker-ts` failed rules checks; retain those checks
  and test the adapter before connecting the UI. Do not adopt the upstream API.
- Add one in-memory local table and a minimal WebSocket server. The server owns
  the game, validates requests, and sends each player a private `TableSnapshot`.
- Add a separate live development screen for two fixed players, with fixed
  starting stacks and blinds, real betting controls, and a manual deal button.
- Carry stacks forward and rotate the button when the next hand is dealt.
- Preserve the existing fake-data playground for visual work.
- Keep login, persistence, deployment, reconnect recovery, turn timers,
  pre-actions, automatic pacing, and new event-driven animations out of scope.

## Capabilities

### New Capabilities

- `table-gameplay`: Server-authoritative no-limit Texas Hold'em hands, including
  legal action processing, per-player table views, settlement, and continuation
  into another hand. This change exposes that behavior through a two-player local
  development screen.

### Modified Capabilities

None. There are no existing capability specs.

## Impact

- Introduces a `server/` workspace package, a server-only engine dependency,
  and a minimal WebSocket transport.
- Extends `shared/` with the development message contract and any snapshot fields
  needed to represent an untimed turn without inventing a countdown.
- Connects the live client screen to the existing table and action components;
  poker rules and private engine state remain outside the browser.
- Adds adapter and server integration tests, client connection-state tests, and a
  documented two-tab acceptance workflow.
- Adds workspace commands to run the local server and validate the new package.
  Existing playground workflows remain available.
- This is an unauthenticated, local-only development milestone, not a server that
  is ready to expose to friends or the public.
