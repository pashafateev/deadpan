# Architecture

Status as of 2026-10-21: **the pieces are agreed. How a hand flows, and the
timer and auto-action rules, are proposed but not yet confirmed.** Confirming
them was deferred until the server work needs them. Open questions are listed
at the end.

## The pieces

One repo, TypeScript throughout.

**`shared/`** holds the message formats between app and server, plus the card
and game types. Both sides use these definitions, so a change on one side that
breaks the other fails to compile instead of failing during a game.
`shared/src/table.ts` defines `TableSnapshot`, the table as one player is
allowed to see it.

**`server/`** is one Node process. The local milestone exposes only WebSocket;
serving built app files on the same port is later #3 work. Its modules are:

- **Gate** (later): checks the shared password when someone connects, then gives their
  browser a session token so a refresh or reconnect doesn't ask again.
- **Table room:** the one live table. It owns connections and the game revision;
  timers, pre-actions, pacing, and saved nightly results are later work. Everything
  a player does arrives as a request, like "I raise to 60", which the table
  room checks before applying.
- **Engine adapter:** a thin wrapper around the rules library with four
  operations: start a hand, apply an action, list the legal actions, and build
  one player's view with everyone else's cards hidden. Nothing else touches the
  library, so switching libraries means changing one file.

**`client/`** is the React app:

- **Store:** the latest snapshot from the server.
- **Event player** (not built yet): plays the server's events back one at a
  time, each with its animation and pause, so the screen can run slightly
  behind the true state while animations finish.
- **Table UI:** components that render only from `TableSnapshot`. Until the
  server exists, the playground fills it with fake data.
- **Sound** (not built yet).

The server address must be a setting, not assumed to be the page's own origin,
so the app can be wrapped with Capacitor later if wanted.

## Selected engine and recovery boundary

Use `@pokertools/engine@2.1.0` on the server, not its upstream API application.
The engine advances streets and settles pots; our adapter translates its
outputs and never repairs or reimplements poker rules.

The [public API](https://unpkg.com/@pokertools/engine@2.1.0/dist/engine/poker-engine.d.ts)
provides `randomProvider` configuration for repeatable test deals, `snapshot`,
and `PokerEngine.restore(snapshot)`. JSON round-trip tests must cover an active
hand with unequal all-in pots and identical continuation through payout.
The [serializer](https://unpkg.com/@pokertools/engine@2.1.0/dist/utils/serialization.js)
preserves the current hand's remaining deck and restores map-backed fields.

Exact current-hand restoration does not mean every process detail is saved:
JSON drops custom RNG functions, a restored engine uses a new clock provider,
and undo history is bounded. A later new deal uses secure randomness by default.
Snapshots have no schema version or comprehensive public validation gate.
Future [#9](https://github.com/pashafateev/deadpan/issues/9) must add a
versioned/validated envelope, room metadata, and storage. None is implemented
in this in-memory milestone.

Do not forward the library's full view or snapshot to clients. Its public-view
masker clears the deck and undo states, but includes config and action history;
our outbound `TableSnapshot` remains an explicit allowlist of permitted fields.
The rejected `poker-ts` findings are recorded in
[options-considered.md](options-considered.md#rules-libraries).

The adapter's `deal`, `act`, and `view` operations use only public engine APIs.
Actions are validated before application. Legal raise totals come from the
engine's range and validation, not from UI arithmetic. Payable calls come from
the engine's preview action record: subtracting final stacks would be wrong
when a call immediately pays out a winning hand. Views copy permitted fields,
hide opponents' folded cards, retain the viewer's own folded cards, and aggregate
per-pot awards per winning seat. Over-stack raises are rejected rather than
letting the library clamp them to all-in. Completed funded players no longer
carry the library's retained all-in betting status.

At each new deal, the adapter restores an in-memory public snapshot without
prior undo history. This prevents recursive history from retaining every
previous hand while preserving stacks, cards, button, and the injected RNG.
Multi-hand tests pin reachable history and compare uninterrupted continuation.
This is memory compaction, not persistent recovery.

## Current local table protocol

- Two fixed players (`dev-a` and `dev-b`) begin with 1,000 chips and 5/10 blinds.
  Their IDs do not depend on display names or seat indices. No account, password,
  settings store, or database is involved.
- A connection first identifies its fixed player ID. A second controller for
  the same ID is rejected rather than replacing the first.
- `deal` and `act` requests carry `expectedSeq` plus a positive `requestId`.
  Only a matching `replyTo` acknowledges that request. Peer updates and late
  errors cannot clear another pending submission. `TableSnapshot.seq` is the
  current game version, advanced once per accepted request; joins and rejected
  requests do not advance it. Check/apply/publish happens without an async gap.
- Only a bound player's own turn can change the hand. Decode JSON into
  allowlisted message fields and validate whole-chip amounts before the engine.
- Each snapshot explicitly reports `handStatus` as waiting, playing, or
  complete. A fold can finish a hand on its existing betting street.
- `turn` is either absent (`null`) or an acting seat plus an optional `clock`.
  A null clock means no time limit, not no actor. The live table has no clock;
  timed playground fixtures still do.
- Only the acting viewer gets `legalActions`. Street-total raises and stack-capped
  calls come from the engine. `preActionsEnabled` is false on the live table and
  `preAction` is null; the playground retains its advance-action controls.
- Both players must be connected and funded to deal manually. Completed hands
  remain visible until another deal, which preserves stacks and moves the button.
  A bust stops further dealing; restart the development server to reset.
- All-in runouts and settlement happen through the engine without artificial
  delays. Paid-out snapshots clear live bets/pots and aggregate each winner's
  awards, preventing chips from being displayed twice.
- Closing a connection releases only its controller. It does not fold a hand,
  change seats, advance the version, or reset stacks. A deliberately opened
  fresh connection identifies again and gets the current private snapshot.
  Remaining controllers get same-version presence snapshots showing the offline
  seat and its restored status on rejoin.
- Publication failures are isolated per controller after commit. An unusable
  view/socket closes; healthy peers receive the applied game revision instead of
  an error falsely claiming the accepted action failed.
- Browser WebSocket origins must be HTTP/HTTPS loopback origins. Native local
  tools may omit Origin. A permanent server-error listener handles errors after
  startup; this does not add public hosting or production authentication.
- Restarting the server resets the table and version. Persistent recovery,
  automatic reconnect, timers, production access, and animation events remain
  separate changes.

## How a hand flows (proposed)

**The server decides everything; screens only display.** A phone never decides
what's legal or who won.

After anything changes, the server sends each player one message with:

- **Events:** what just happened, for the event player to animate, like "Sam
  raised to 60" or "flop: K♠ 7♦ 2♣".
- **Snapshot:** the whole table as that player may see it: their own cards,
  everyone else's face down, stacks and pots, whose turn it is, and their legal
  moves with the smallest and largest allowed bet.

The snapshot is what counts; events only drive animation. Messages are
numbered, so a phone that missed some (bad signal, switched apps) skips those
animations and jumps to the latest snapshot.

A hand from start to finish:

1. Once two or more players are seated, the server starts a hand. The button
   moves, blinds are posted, and cards are dealt from a securely randomized
   shuffle.
2. On your turn you send a request like "raise to 60", tagged with which turn
   it's for. The server checks it's your turn and the move is legal, then
   applies it. A late or doubled tap is ignored rather than applied to the
   wrong turn.
3. When a betting round ends, bets slide into the pot, side pots split off if
   someone is all in, and the next street is dealt.
4. If everyone left is all in, the remaining board cards come one at a time
   with longer pauses.
5. At showdown, everyone still in shows their cards. Each pot is paid out
   separately, side pots first and the main pot last. A player who wins because
   everyone folded can choose to show.
6. The result goes into the night's results file, and the next hand starts
   after a short pause.

**The server sets the pace of big moments.** Pauses between streets and hands
happen on the server, so every screen stays in step and a turn timer only
starts once the cards have landed. Each phone handles the small animations
within a moment.

## Timers and auto-actions (proposed)

- A visible turn timer, plus a time bank for hard decisions.
- On timeout: check if possible, otherwise fold. Sit a player out after a
  couple of missed turns.
- Pre-action buttons while waiting: check/fold, check, call X, call any.
  "Call 20" clears if someone raises to 60; "call any" stays selected.
- Pacing: short pauses between streets and a slower reveal when players are all
  in. This overlaps with the animation work.

## Open questions

- Does everyone still in at showdown have to show their cards? Proposed: yes.
- Does the next hand start automatically? Proposed: yes.
- Timer and time-bank lengths, and how long to wait before sitting someone out.
- How long a disconnected player keeps their seat.
- Hosting provider. Direction: one small Node server that sleeps when unused; Cloudflare
  Durable Objects was the alternative mentioned.
