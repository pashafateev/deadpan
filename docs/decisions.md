# Decisions

Last updated 2026-10-22.

## What deadpan is

A private poker site for one group of friends. Standard no-limit Texas Hold'em,
play chips only, one table of 2–9 players. Friends open a shared link and enter
a shared password.

## Decided

- **Platform:** a website that works on a phone held upright and on desktop,
  installable to the home screen. Keep it ready to wrap with Capacitor later
  (configurable server address, standard web APIs only). No app stores for now.
- **Rendering:** regular DOM elements animated with Motion, plus a thin effects
  layer for things like confetti. No canvas game engine, no 3D.
- **Stack:** TypeScript everywhere, React + Vite, CSS Modules with CSS variables
  for theming, Vitest. A pnpm workspace with `shared/` and `client/` now and
  `server/` later.
- **Access:** one shared password for the table, remembered by the browser.
  No individual accounts.
- **Chips:** stacks reset each game night. Comparing nights is post-MVP, but the
  server should save each night's results to a file from day one so there is
  history to compare later.
- **Rules:** use `@pokertools/engine@2.1.0`, wrapped on the server, rather than
  writing poker rules ourselves. The user approved switching after `poker-ts`
  failed short-all-in and side-pot tests. Keep those scenarios, heads-up blinds,
  split pots, uncalled returns, and recovery as regression tests.
- **Engine, not upstream application:** use the published engine package only.
  Keep our one Node server and WebSocket message format; do not adopt the
  upstream API's authentication, database, workers, or financial architecture.
- **First live milestone:** two fixed development players on one computer,
  manual dealing, private snapshots, and no turn deadlines. Login, persistence,
  deployment, automatic reconnect, and new event-driven animations come later.
- **Gameplay extras:** turn timers, a time bank, and pre-action buttons
  (check/fold, check, call X, call any).
- **Mockups:** made in Claude Design; components here get restyled to match.

## Architecture direction

- The server is the only authority. Clients send requests and display what the
  server tells them.
- After every change the server sends each player a list of events (what
  happened, for animation) and a snapshot of the table as that player is allowed
  to see it. Components render from that snapshot type
  (`shared/src/table.ts`); for now the playground fills it with fake data.
- An event player on the client plays events back one at a time so animations
  have room to land.

## Deferred

- Timer lengths, timeout behavior, and pauses between streets.
- Showdown rules (proposed: everyone still in shows their cards) and whether the
  next hand starts automatically (proposed: yes).
- Reconnection details and hosting.
- Comparing results across nights.
