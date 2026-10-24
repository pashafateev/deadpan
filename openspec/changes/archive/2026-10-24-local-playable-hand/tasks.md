# Tasks

These checkboxes describe future implementation, not completed work. A snapshot
is one player's permitted table view; its revision (`seq`) is the game version
number. See `design.md` for examples and the full mapping to existing issues.
Issue links below indicate related work, not issues this milestone fully closes.

## 1. Establish the server-only engine adapter

- [x] 1.1 Create the `server/` workspace package with pinned `@pokertools/engine@2.1.0`
  dependency, Vitest, and development/typecheck/build scripts; verify
  `pnpm install`, server typechecking, and the server build succeed without
  adding the rules dependency to the client. Reuse this foundation for
  [server skeleton #3](https://github.com/pashafateev/deadpan/issues/3).
- [x] 1.2 Inspect and test the selected release's supported deterministic RNG
  and JSON snapshot/restore APIs for an active hand, including unequal pots.
  Document the APIs and limitations for
  [recovery #9](https://github.com/pashafateev/deadpan/issues/9) in
  `docs/architecture.md`; verify restored continuation preserves cards,
  acting player, bets, and payouts. Do not implement persistent storage.
- [x] 1.3 Write adapter tests before implementing operations to start a hand,
  apply an action, and list legal actions; verify a repeatable test hand reaches
  the expected next player without exposing the library's full table outside
  the adapter.
- [x] 1.4 Test first and implement chip-amount translation for raises to a
  betting-round total, calls capped by the remaining stack, legal raise ranges,
  and invalid-action rejection; verify amounts match the shared action format
  and rejected actions leave the engine unchanged.
- [x] 1.5 Add deterministic tests for heads-up blind/action order, a fold win,
  contested showdown, and an all-in runout; verify expected stacks, results,
  and chip conservation using library-driven settlement.
- [x] 1.6 Add deterministic multiway tests for a short all-in that does not
  reopen betting, unequal-stack side pots, uncalled returns, and a tied pot
  with an odd chip; verify eligibility and exact payouts, stopping to report
  any library rules gap rather than implementing replacement rules.
- [x] 1.7 Record the confirmed engine-only `@pokertools/engine` selection in `docs/decisions.md` and
  update the corresponding adapter/library descriptions in
  `docs/architecture.md` and `docs/options-considered.md`; verify the documents
  agree with the dependency and the tests actually run.

## 2. Define snapshots and the message contract

- [x] 2.1 Extend shared types/exports with hand status (waiting/playing/complete),
  the seat of the player whose turn it is plus an optional clock,
  `preActionsEnabled`, and development messages that identify players by ID and
  carry the game version for actions/deals; verify
  `pnpm --filter @deadpan/shared typecheck` passes and no exported contract
  contains library-private types.
- [x] 2.2 Update playground mocks and table/seat/timer rendering for the new
  snapshot shape, with tests first for any new pure display helpers;
  verify turns without a time limit still highlight the acting player,
  completed hands have no controls, existing timed/pre-action scenarios work, and
  `pnpm typecheck` passes for all consumers.
- [x] 2.3 Test first and implement building each player's permitted snapshot;
  verify actual outgoing JSON for opening, folded, all-in, and showdown views
  contains only permitted cards, correct chip accounting, and legal actions
  only for the acting viewer.
- [x] 2.4 Document the shared snapshot format, hand status, optional clocks,
  privacy, and the game-version meaning of `seq` in shared type comments and
  `docs/architecture.md`; verify the descriptions match the snapshot tests
  and do not imply step-by-step animation messages already exist.

## 3. Run one in-memory table room

- [x] 3.1 Write room tests before adding two fixed development players and
  manual first/next deal. Give players fixed internal IDs separate from names
  and seat numbers, following
  [identity #6](https://github.com/pashafateev/deadpan/issues/6); verify
  `PlayerView.id` and connection ownership use those IDs, deals require
  connected funded players, preserve settled stacks, rotate the button, clear
  old results, and are rejected during an active hand or after a bust.
- [x] 3.2 Test first and implement actions associated with the connection's
  player ID, finishing each version check and game update before processing the
  next request; verify illegal, out-of-turn, outdated, and duplicate
  actions/deals leave the game and version unchanged, while accepted requests
  send both private views at the same incremented version.
- [x] 3.3 Test first and implement hand progression through the next
  decision or settlement; verify all-in runouts need no extra input,
  completed snapshots contain paid-out stacks with no live bets/pots, and
  connection closure never auto-acts or resets the hand.
- [x] 3.4 Document fixed player IDs, development defaults, manual dealing, and
  server-restart behavior in `docs/architecture.md`; verify IDs remain fixed
  while the game resets on restart, and every described transition has a
  corresponding room test.

## 4. Expose the local WebSocket server

- [x] 4.1 Add `ws` and test runtime message parsing before connecting it to the
  room; verify malformed JSON, unknown message shapes/player IDs, invalid
  version numbers, and unsafe or noninteger chip amounts produce safe errors
  without mutating the table or terminating valid connections.
- [x] 4.2 Bind the server to `127.0.0.1` so it accepts only same-computer
  connections, and associate each connection with a fixed player ID.
  Verify with transport integration tests that a second active connection for
  the same ID is rejected without replacing the first, an ID can be selected
  again after its connection closes, a new connection receives the current
  private snapshot, and there is no public-host mode.
- [x] 4.3 Add a real two-socket integration test that deals, acts, settles, and
  deals again; verify matching game versions, private outgoing messages,
  preserved stacks, button rotation, and stale-request rejection across sockets.
- [x] 4.4 Add and document `pnpm dev:server`, the exact server build command,
  local server address, and `VITE_SERVER_URL` in `README.md`; verify the commands
  run as written and root test/typecheck scripts include the server. Record
  that [#3](https://github.com/pashafateev/deadpan/issues/3) remains partially
  complete rather than creating another server or claiming its deferred
  production and combined-development setup is done.

## 5. Connect the live development screen

- [x] 5.1 Write client connection-state tests before implementing the
  WebSocket controller; verify identify/snapshot/error handling, configured
  server selection, pending-request suppression, and connection closure without
  changing game data ahead of the server or automatically reconnecting.
  Leave full recovery to
  [resilience #11](https://github.com/pashafateev/deadpan/issues/11).
- [x] 5.2 Add the `/live` screen with fixed-player selection, local-development
  labeling, connection/error feedback, and manual deal controls; verify displayed
  names map to the fixed player IDs, two independent tabs can select distinct
  players, and `/` still opens the server-independent playground.
- [x] 5.3 Wire received snapshots and actions carrying the game version to `Table`;
  verify only the acting viewer can submit betting actions, controls are
  disabled while pending/disconnected, turns without a time limit show no
  countdown, and live waiting views expose no pre-action controls.
- [x] 5.4 Document the exact two-tab walkthrough, development-only access,
  server configuration, and unsupported production features in `README.md`;
  update `docs/handoff.md` to distinguish implemented behavior from remaining
  issues, and verify the walkthrough matches the actual screen and commands.
  Link [hosting #13](https://github.com/pashafateev/deadpan/issues/13) for later
  deployment/sleep work without adding it to this milestone.

## 6. Validate the complete local workflow

- [x] 6.1 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and the documented
  server build command; verify all pass and record any checks that could not
  be run instead of treating them as passing.
- [x] 6.2 Follow the documented two-tab workflow at 375x812 and desktop widths;
  verify a fold, a contested showdown, an all-in, another hand with carried
  stacks/button rotation, rejected duplicate or out-of-turn requests, and
  connection loss. Inspect WebSocket payloads for hidden-card privacy, recheck
  the playground without a server, and record the observed results.
