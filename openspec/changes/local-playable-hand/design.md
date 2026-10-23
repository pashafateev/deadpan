# Design

## Context

See `proposal.md` for motivation and `specs/table-gameplay/spec.md` for behavior.
This design explains how to connect the existing React table to `@pokertools/engine`
running in one local Node server.

`Table` already displays a `TableSnapshot`: the full description of the table
that one player is allowed to see at a particular moment. It sends `PlayerAction`
requests when that player clicks a betting control. The playground currently
responds by selecting another fake scenario; there is no server connection yet.
The user approved `@pokertools/engine@2.1.0` after `poker-ts` failed rules checks.
Use the engine only, not the upstream API application or its infrastructure.

"Game state" below means the current situation at the poker table: cards, stacks,
bets, pots, and whose turn it is. It does not mean a database table. A "street"
is a betting stage within a hand: preflop, flop, turn, or river.

Two existing modeling details need attention:

- `turn` currently requires a countdown whenever there is an acting player.
  The first live version has no time limits, but must still show whose turn it is.
- `street` alone cannot distinguish a completed fold from ongoing betting on
  that street. Track whether the hand has finished separately from its street
  or whether cards were revealed.

## Goals / Non-Goals

**Goals**

- Give the server the final say about poker actions, stacks, and results.
- Connect two independent browsers to the same game without exposing secret cards.
- Process game changes one at a time and test them separately from networking.
- Make the first implementation useful without production infrastructure.

**Non-Goals**

- A generic room framework, multiple tables, or a production identity system.
- Implementing any missing poker rules ourselves.
- Designing messages and playback for future step-by-step animations.
- Changing the visual design beyond connection feedback, an indication of whose
  turn it is without a countdown, and the small development toolbar.

## Decisions

### 1. Keep rules, table management, and networking in one server

Create one `server/` workspace package running one Node process. Separate the
following code modules, not deployed services:

- **Engine adapter:** the only production code importing `@pokertools/engine`. It starts hands,
  applies legal actions, and translates the library's cards, legal moves, and
  results into our app's format. It builds only the poker information each
  viewer is permitted to see.
- **Table room:** manages the one shared game, fixed player details, connections,
  hand progress, and game version number. It combines the adapter's poker view
  with these details into `TableSnapshot`; it does not calculate poker rules.
- **WebSocket endpoint:** reads incoming messages, associates each connection
  with a player ID, and forwards requests and responses without changing cards
  or chips itself.

Small translation functions are sometimes called "normalization helpers."
Keep them pure where possible: the same inputs produce the same output, without
changing inputs or other state, reading a clock, or sending messages. Test them first.
The library's immutable game state remains private to the adapter; browsers
receive only our explicitly constructed snapshots.

The server is the authority: the browser requests an action, but cannot declare
new stacks or results. Running the full engine, deck, and all players' cards
inside React would expose secrets through browser developer tools and would
not test communication with a shared server. A general-purpose server framework
would add unrelated work.

### 2. Number game updates and reject outdated requests

Keep the agreed message formats in `shared/`, so server and client use the same
field names and meanings:

- Client: identify a fixed development player by ID; request a deal with
  `expectedSeq`; request an action with `expectedSeq` and `PlayerAction`.
- Server: a viewer-specific snapshot; or a bounded error code and safe message.

Check incoming message contents at runtime; TypeScript alone cannot validate
network input. Reject invalid message kinds, unsupported player IDs,
unsafe/noninteger chip amounts, and malformed version numbers before touching
the engine. Actions and deals cannot select a different player: the connection
already identifies who is asking.

Use `TableSnapshot.seq` as a revision, meaning a version number for the game.
It is not an animation frame counter: the screen can redraw thousands of times
while the game stays at version 17. A request includes `expectedSeq` to say which
version the player was looking at.

Each accepted action or deal advances the version once. If two requests both
expect version 17, the first accepted request changes it to 18, and the second
is rejected as outdated. Joins receive the current version; errors and rejected
requests do not advance it. Both players receive the same version number with
their own private view. Update the shared type's current "every message" comment
to describe this rule.

One request can finish several poker stages. For example, the last all-in call
can lead to the flop, turn, river, and payout without another player decision.
For this milestone, finish those library operations and publish one final
snapshot at the next version, not a separate update for every card.

Finish checking, applying, numbering, and sending one game change before
processing the next request. Do not pause with an `await` between checking a
version and updating the game, which could let two requests pass against the
same old version. This prevents double taps and duplicate deals without
separate request or turn IDs in this small, snapshot-only version.

WebSocket provides one two-way channel for these messages on the same server.
HTTP polling or HTTP plus server-sent events could also work; WebSocket is not
a rules-library requirement or a separate managed service. Recovery and
authentication would still be needed with either alternative.

### 3. Separate hand progress, whose turn it is, and the timer

Add an explicit hand status to `TableSnapshot`: waiting, playing, or complete.
Keep `street` about the poker stage; a fold can finish a hand without a showdown.

An "acting seat" is the numbered seat occupied by the player whose turn it is.
Represent a turn with that seat and an optional clock. "Nullable" means the clock
can be absent, represented by `null`:

- No turn: nobody needs to act.
- Turn with no clock: a player needs to act, with no time limit.
- Turn with a clock: a player needs to act within the allotted time.

The clock belongs to that turn and groups its start time, duration, and time-bank
data. It is not required to identify the player. Live development hands have no
clock; the playground can still provide clocks for its timed scenarios.

Highlight whose turn it is independently of `TimerRing`, the existing component
that draws a shrinking countdown ring around the avatar. Do not show a fake
zero-second timer or infer that a hand is complete because its clock is absent.
Do not show betting or pre-action controls after the hand is complete.

The "snapshot contract" is the shared format of the per-player table view.
Add `preActionsEnabled` there: false for the live table and true for existing
playground scenarios. It controls advance-action buttons such as check/fold;
this keeps the playground feature without offering unsupported live actions
or passing extra game facts outside the snapshot.

Translate chip amounts consistently. Raises are totals for the current betting
round: with 10 already committed, "raise to 60" adds another 50. Calls specify the
extra chips actually payable, capped by the remaining stack. Collected pots do
not include bets still on the current street. The adapter supplies legal raise
ranges, including a short all-in when that is the only permitted raise; the
slider and visible highest bet do not decide legality.

### 4. Send only the information each viewer may see

Build each snapshot by explicitly choosing permitted fields. Do not send the
library's full table and rely on the UI to hide parts of it. Use the existing
`HoleCards` variants for hidden, absent, and revealed cards.

At a contested showdown, reveal the hands still contesting the pot. After an
uncontested fold, do not automatically reveal either player's hand to the other.
Winner details and error messages must not leak folded cards or private engine
objects. Terminal snapshots show paid-out stacks and winner summaries, with
settled bets/pots cleared so awards are not counted twice.

Test the actual outgoing messages, including their JSON representation.
"Serialization" means converting data into a sendable format. A screen showing
card backs can still leak cards in its messages, so checking only the rendered
UI is not enough.

### 5. Use two fixed development players

Give each player a fixed internal ID, a separate display name, and a seat.
Connection bindings and `PlayerView.id` use the ID, not the name or seat number.
These IDs stay the same across development-server restarts; they do not require
accounts or a database. This preserves the identity separation needed by
[stable player IDs, #6](https://github.com/pashafateev/deadpan/issues/6).

Start both players with 1,000 integer chips and 5/10 blinds. These are reversible
development defaults, not game-night product settings.
Either player can request the first or next hand once both are connected and
both have chips. Preserve stacks and let the library manage button/blind order.
Reject a deal during a hand. If a player busts, stop dealing; restarting the
development server resets the fixture rather than introducing rebuys.

After every action, use the library's supported progression operations until
the next player decision or settlement. All-in boards can arrive in one final
snapshot; there are no artificial pauses or new events. Leave the completed
hand visible until a manual deal.

Adapter tests can use three or more players to exercise side pots and reopening
rules. The interactive fixture remains two-player; do not hard-code two-player
poker rules into the adapter.

### 6. Connect locally without pretending this is authentication

Use a minimal Node server and the `ws` transport, bound to `127.0.0.1`. Do not
offer a public-host mode in this change. This address is "loopback": the computer
talks to itself, so both browser tabs and the game server run on the same machine.
The browser uses standard `WebSocket` and reads `VITE_SERVER_URL`, defaulting to
a documented address on that machine.

The first message selects a fixed development player by ID. If one tab already
controls player A, another tab selecting A receives an error instead of taking
over. It can select player B instead. After the server observes the first socket
closing, a new connection can select A and receive the current private view.
Closing a socket does not auto-fold, reset the hand, or give the opponent
control. There is no automatic reconnect or seat-expiry policy.

This is not authentication. Label the live screen as local development. The
existing network-accessible Vite playground can remain unchanged, but remote
devices cannot reach this loopback game server.

### 7. Connect a separate screen, not a rewritten playground

Keep `/` as the current fake-data playground and select the live development
screen at `/live`. Use a simple pathname switch, not a new routing dependency.
The live toolbar chooses the development player and offers the deal control.

A small client connection controller owns connection state, the last received
snapshot, errors, and whether a request is awaiting a response. It does not
calculate poker state. A snapshot with a newer version resolves a submitted
request; an error also clears the waiting state. Connection closure disables
requests and requires a deliberate new connection. Do not submit another request
while one is pending or while disconnected. Do not change chips, cards, or
winners before receiving the server's snapshot.

Feed received snapshots into the existing `Table` component. Keep all gameplay
facts in `TableSnapshot`; connection feedback and request errors sit outside
the table as transport status. Existing snapshot-driven transitions may still
animate, but there is no new animation queue or event player.

## Relationship to existing GitHub issues

This milestone starts parts of existing work; it does not replace the backlog
or complete every issue it touches.

| Existing issue | Work started here | Work still deferred |
|---|---|---|
| [#3: server skeleton](https://github.com/pashafateev/deadpan/issues/3) | One server package, shared messages, WebSocket transport, package scripts | Serving built client files, health checks, production configuration/shutdown, combined client/server development command |
| [#6: stable player IDs](https://github.com/pashafateev/deadpan/issues/6) | Fixed internal IDs separate from display names and seats | Lobby names, stored player records, remembered identities |
| [#9: save and restore](https://github.com/pashafateev/deadpan/issues/9) | Adapter boundary and early investigation of the library's recovery options | Database writes, saved engine state, restart recovery |
| [#11: connection resilience](https://github.com/pashafateev/deadpan/issues/11) | Versioned private snapshots, configurable server address, connection feedback | Heartbeats, automatic reconnect, sessions, production origin/version checks |
| [#13: hosting](https://github.com/pashafateev/deadpan/issues/13) | One-process shape, not multiple services | Deployment and safe automatic sleep/wake |

Reuse this server and message format when completing #3 and #11; do not scaffold
a second implementation or mark those issues complete based on this milestone.
Storage, password access, real settings, seat modes, and game-night rules remain
separate work in [#4](https://github.com/pashafateev/deadpan/issues/4),
[#5](https://github.com/pashafateev/deadpan/issues/5),
[#7](https://github.com/pashafateev/deadpan/issues/7),
[#8](https://github.com/pashafateev/deadpan/issues/8), and
[#10](https://github.com/pashafateev/deadpan/issues/10).

## Risks / Trade-offs

- **Library behavior is not yet verified here.** First pin a compatible
  `@pokertools/engine` release and test its actual APIs with deterministic fixtures.
  Exercise heads-up blinds, short all-ins, unequal multiway all-ins, uncalled
  returns, and odd-chip splits. Report a blocking rules gap rather than writing
  replacement rules or silently switching libraries.
- **Recovery APIs still need integration boundaries.** The published engine
  supports JSON snapshots and restoring a current hand's remaining deck and
  bets; verify these using supported APIs and controlled RNG in tests. Its
  snapshots are unversioned and JSON omits injected RNG/clock functions.
  Future #9 must validate/version saved data and also save room metadata.
  Do not implement a persistent store or reconnect recovery in this milestone.
- **Rejected requests must not change the game.** Validate before applying and
  test that illegal requests leave engine state and revision unchanged.
- **Snapshots may skip visual moments.** Accept this for the local
  milestone; future event playback can be added around the same authoritative
  snapshot boundary.
- **Hands without time limits can stall when a player leaves.** This is deliberate
  development behavior; timeout and reconnect policy belong to later changes.
- **Game version numbers reset on server restart.** There is no persistence or
  automatic reconnect. New connections receive the new initial state.
- **The snapshot shape changes.** No deployed server consumes it yet; update
  all playground mocks, components, and tests together rather than adding a
  compatibility layer.

## Migration Plan

During implementation, introduce the adapter and its tests first, then the
shared contract and room, then transport and client integration. Add a
documented `pnpm dev:server` command alongside the existing `pnpm dev`; ensure
workspace test/typecheck commands include the new package and provide an
explicit server build check.

Update project documentation to record the selected library, local-only
milestone, exact two-tab steps, and remaining production work. Keep these
documentation updates in the implementation change; this capture edits only
OpenSpec artifacts.

Validate with `pnpm test`, `pnpm typecheck`, `pnpm build`, the server build, and
the documented two-tab workflow at 375x812 and desktop widths. Include a fold,
a contested showdown, an all-in, another deal with carried stacks/button
rotation, request rejection, and connection loss. Inspect WebSocket payloads
for privacy and recheck the independent playground without a server.

There is no deployment or persisted-data migration. Rolling back removes the
live screen/server and restores the prior shared shape together; the existing
playground remains the default entry point throughout.
