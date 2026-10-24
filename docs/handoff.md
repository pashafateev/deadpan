# Handoff

Implementation state for `local-playable-hand`, prepared for review on
`feature/local-playable-hand`. This is a local-development milestone rather
than the production launch. Update this file in the same PR as the change.

## Summary

- **Built:** the existing table/playground plus a local two-player live screen,
  server-only rules adapter, in-memory room, and loopback WebSocket transport.
  `/` remains fake data; `/live` runs real hands in two tabs on one computer.
- **Rules:** the user approved `@pokertools/engine@2.1.0`, engine only, after
  `poker-ts@1.5.0` failed short-all-in and side-pot tests. No rules fork and no
  upstream API/authentication/database/worker application was adopted.
- **Not built:** production password/session access, stored player records,
  settings, seat modes, persistence, timers/pre-actions, automatic reconnect,
  event playback, lobby, deployment, and sleep/wake. The server work only
  partially implements #3; do not close launch issues on this basis.
- **Checks in this worktree:** `pnpm test` passes 283 tests in 15 files
  (156 client, 127 server); `pnpm typecheck`, `pnpm build`, and
  `pnpm --filter @deadpan/server build` pass. There is no CI yet (#14).

PR #24 review follow-up adds strict over-stack rejection, correlated request
replies, same-version peer presence with visible offline status, isolated
post-commit publication failures, local browser-origin checks, bounded engine
history, settled status/own-folded-card fixes, and deep client decoding.
Production access/reconnect/storage work remains deferred.

## Local playable-hand milestone

Two fixed development players begin with 1,000 chips and 5/10 blinds. Both must
be connected and funded to deal manually; stacks carry forward and the button
rotates. All-ins run out automatically, and a bust prevents the next deal.
Restart the server to reset, then reconnect manually. See
[the change tasks](../openspec/changes/local-playable-hand/tasks.md) for current
progress and [the recovery boundary](architecture.md#selected-engine-and-recovery-boundary)
for the selected engine's supported APIs and remaining persistence work.

The scope remains local-only and in-memory. Do not adopt the upstream API's
database/authentication/worker architecture or interpret this as launch-ready.

## Picking up

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm --filter @deadpan/server build
pnpm dev:server
```

In a second terminal run `pnpm dev`, then open `/live` on Vite's printed Local
address in two tabs, selecting Alex in one and Sam in the other. See the
[README walkthrough](../README.md#local-two-player-game) for commands, port
configuration, and connection limitations.

`pnpm dev` also serves the playground at http://localhost:5173. Its menu switches
between my turn, waiting, all-in run-out, showdown and not seated, for 2 to 9
players. Read `CLAUDE.md` for conventions and `docs/decisions.md` for what's
settled.

## What's in the code

Tool versions: Node 26.10, pnpm 10.32.1, TypeScript 7.0.2, React 19.3.1,
Vite 8.3.5, Vitest 5.0.5, Motion 14.5.0.

- **`shared/src/`**
  - `table.ts`: `TableSnapshot`, the per-player view with explicit hand status
    and acting seat/optional clock.
  - `actions.ts`: `PlayerAction`, a player's request on their turn.
  - `cards.ts`: card types.
  - `messages.ts`: fixed development IDs and the request/snapshot/error format.
- **`server/src/`**
  - `engine/adapter.ts`: the only production module importing the rules library.
    Builds private allowlisted views; legal calls/raises and payouts remain
    library decisions.
  - `room.ts`: fixed player metadata, controller bindings, manual hands, and
    synchronous version checking/application/publication.
  - `protocol.ts`: runtime validation of untrusted JSON.
  - `server.ts` and `main.ts`: WebSocket transport and loopback-only startup.
  - Tests cover deterministic edge hands, 200 generated sample hands, JSON
    recovery feasibility, privacy, rejection behavior, and actual sockets.
- **`client/src/table/`**
  - **Components:** `Table` (picks the phone or desktop layout from its own
    size), `Seat`, `PlayingCard`, `TableCenter` (board and pot), `ActionBar`,
    `PreActionBar`, `TimerRing`, `ChipCount`, `Confetti`.
  - **Pure helpers with tests:** `layout.ts` places seats, `betting.ts` handles
    bet presets and slider snapping, and `format.ts` formats chips and card
    labels.
- **`client/src/playground/`:** the playground page, and `mocks.ts`, which
  builds the fake tables.
- **`client/src/live/`:** connection controller, runtime response validation,
  transport toolbar, and snapshot-driven table integration. There is no
  optimistic game mutation or automatic reconnect.
- **`client/src/main.tsx`** selects `/live` or the playground by pathname.
- **Styling** is a placeholder. Colors and sizes live in
  `client/src/styles/tokens.css`, ready for the mockups.

What has been checked, and what hasn't:

- **Logic:** covered by unit and real-WebSocket integration tests.
- **Browser workflow:** automated in local headless Chrome 155 at 375×812 and
  1280×800, with screenshot inspection. Covered separate identities/private
  cards, duplicate-controller rejection, fold/showdown/all-in payout, next
  hands, double taps, stale/out-of-turn errors, server loss, manual reconnect
  after restart/version reset, and the built server's startup.
- **Review regressions:** browser checks additionally cover refused-first-connect
  labeling, requester-only acknowledgements, over-stack rejection without
  mutation, visible peer offline/rejoin state, own folded cards, settled all-in
  labels, and rejection of a foreign browser page's WebSocket connection.
- **Playground:** checked without a game server across all scenarios and 2, 6,
  and 9 players at both viewport sizes.
- **Not checked yet:** a 320px-wide phone (iPhone SE), landscape phones, Safari
  and real devices.

Gaps against `docs/design-brief.md`:

- No time-bank button. Timed playground clocks carry `timeBankMs`, but live
  turns have no deadlines.
- No emoji reactions.
- No join screen.
- No sound.
- No deal-from-the-deck, chips-to-pot or pot-to-winner animations. These need
  the event player.
- Existing confetti particles can extend page scroll bounds during/following
  a showdown burst. This predates the review fixes; static phone/desktop layout
  checks pass. Leave clipping/removal of those particles as visual follow-up.

## Backlog

The issues were written by collaborator `liveandletbri` on 2026-10-22. Each one
states its priority in its first line.

| Priority | Issues |
|---|---|
| Needed for launch | #3 server skeleton, #4 SQLite storage, #5 password gate and session tokens, #6 stable player IDs, #7 table settings, #8 seat modes (away, auto-fold), #9 save and restore the live table, #10 end of night, #11 connection resilience, #12 Dockerfile, #13 Fly.io hosting, #14 CI and deploys |
| Nice to have | #15 Litestream backups, #20 per-player settings and progression |
| Post-launch | #16 roster with PINs, #17 night setup screen, #18 rebuys, #19 admin controls, #21 install to home screen |

Dependencies stated in the issues:

- #9 depends on #4 and on the rules-library pick.
- #19 depends on #16 and #18.
- #20 depends on #16.

A workable order: #3, then #4, then #5, #6 and #7, then the core game (see
below), then #8 to #11, then #12 to #14.

**The core local game is tracked by the `local-playable-hand` OpenSpec change,**
not a new GitHub issue. It implements the adapter, local room, and live client.
Turn timers/pre-actions, the event player, lobby, and production orchestration
still need later work. Several launch issues assume those features; see
`docs/architecture.md` and the change's issue-alignment table before proceeding.

## Where the issues go beyond the docs

The issues make choices the docs don't record yet. Before treating these as
settled, ask the user whether to update `docs/decisions.md` to match.

- **Storage:** #4 replaces the nightly results file in `decisions.md` with one
  SQLite database (`better-sqlite3`, WAL mode). It holds players, nights,
  results, buy-ins and the live table.
- **Game night:** #10 defines a night as ending after 3 hours with no hand
  dealt. At launch, a player who busts is out for the night: no rebuys until
  #18.
- **Hosting:** #13 picks Fly.io: exactly one machine in `sjc` that stops
  between nights, plus a volume with daily snapshots. The docs still list
  hosting as open.
- **Players:** #6 gives players stable IDs behind their lobby names from day
  one. #16 adds per-player PINs after launch. `decisions.md` says "no
  individual accounts", which still holds at launch.
- **Snapshot type:** #8 adds `seatMode` and `seatModeReason` to `PlayerView`,
  so `shared/src/table.ts` and the playground mocks will change.
- **Sessions and connections:** #5 keeps the session token in `localStorage`
  and sends it in the first WebSocket message. #11 makes the server address
  `VITE_SERVER_URL`.
- **Phone testing:** #21 notes that wake lock and installing to the home screen
  need HTTPS. The README's tip to test on a phone through the dev server's
  network address uses plain HTTP, so those features won't work that way.

## Waiting on the user

- **Mockups:** from Claude Design, using the brief in `docs/design-brief.md`.
- **Deferred decisions:** the open questions at the end of
  `docs/architecture.md`, such as showdown rules, timer lengths and how long a
  disconnected player keeps their seat.

## Working notes

- **Pull requests:** each change goes on a branch with a PR, and the user
  merges. The merged branches `table-components`, `planning-docs` and
  `codex/setup-openspec` are still on GitHub.
- **OpenSpec:** `openspec/` (spec-driven schema) and the Codex skills in
  `.agents/skills/openspec-*` drive a propose, apply, archive workflow.
  `openspec/config.yaml` has no project context yet.
- **Agent instructions:** Codex reads `AGENTS.md`, which doesn't exist; the
  conventions live in `CLAUDE.md`.
- **Claude desktop app:** `.claude/launch.json` defines a `client` preview
  (`pnpm dev`, port 5173).
- **GitHub accounts:** the repo belongs to `pashafateev`. The planning session
  for this project ran in a different folder (`rlig`), so notes saved there
  don't load here. Everything durable is in this repo.
