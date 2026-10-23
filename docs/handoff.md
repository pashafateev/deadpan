# Handoff

State of the repo on 2026-10-22, with `main` at `7f7de43`. Whoever hands off
next: update this file in the same PR as your last change.

## Summary

- **Built:** the table UI and a playground that runs on fake data (PR #1), plus
  the planning docs and `CLAUDE.md` (PR #2). OpenSpec is set up for Codex
  (PR #22), with no specs or changes in it yet.
- **Not started:** the server. The launch backlog is GitHub issues #3–#21.
- **Waiting on the user:** which rules library to use, and the Claude Design
  mockups.
- **Checks on `main`:** `pnpm typecheck` passes for both packages, `pnpm test`
  passes 25 tests in 4 files, and `pnpm build` succeeds. There is no CI yet
  (#14), so run these locally before opening a PR.

## Picking up

```bash
git checkout main && git pull
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm dev
```

`pnpm dev` serves the playground at http://localhost:5173. Its menu switches
between my turn, waiting, all-in run-out, showdown and not seated, for 2 to 9
players. Read `CLAUDE.md` for conventions and `docs/decisions.md` for what's
settled.

## What's in the code

Tool versions: Node 26.10, pnpm 10.32.1, TypeScript 7.0.2, React 19.3.1,
Vite 8.3.5, Vitest 5.0.5, Motion 14.5.0.

- **`shared/src/`**
  - `table.ts`: `TableSnapshot`, the per-player view the server will send.
  - `actions.ts`: `PlayerAction`, a player's request on their turn.
  - `cards.ts`: card types.
- **`client/src/table/`**
  - **Components:** `Table` (picks the phone or desktop layout from its own
    size), `Seat`, `PlayingCard`, `TableCenter` (board and pot), `ActionBar`,
    `PreActionBar`, `TimerRing`, `ChipCount`, `Confetti`.
  - **Pure helpers with tests:** `layout.ts` places seats, `betting.ts` handles
    bet presets and slider snapping, and `format.ts` formats chips and card
    labels.
- **`client/src/playground/`:** the playground page, and `mocks.ts`, which
  builds the fake tables.
- **`client/src/main.tsx`** renders the playground directly. There's no
  routing, join screen or server connection yet.
- **Styling** is a placeholder. Colors and sizes live in
  `client/src/styles/tokens.css`, ready for the mockups.

What has been checked, and what hasn't:

- **Logic:** covered by unit tests.
- **Components:** checked by hand in the playground at 375×812 and 1280×800
  with 2, 6 and 9 players.
- **Not checked yet:** a 320px-wide phone (iPhone SE), landscape phones, Safari
  and real devices.

Gaps against `docs/design-brief.md`:

- No time-bank button. The snapshot has `timeBankMs`, but nothing displays it.
- No emoji reactions.
- No join screen.
- No sound.
- No deal-from-the-deck, chips-to-pot or pot-to-winner animations. These need
  the event player.

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

**The core game has no issue yet.** No issue covers:

- the engine adapter wrapping the rules library
- the table room running hands
- turn timers and pre-actions
- the client connecting to the server and rendering live snapshots
- the event player
- the lobby UI

Several issues assume these exist. They are described in
`docs/architecture.md`.

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

- **Rules library:** `@pokertools/engine` or `poker-ts` are the candidates in
  `docs/options-considered.md`. The user is choosing; don't run an evaluation
  unless asked. #9 notes that `@pokertools/engine` has snapshot and restore
  built in.
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
