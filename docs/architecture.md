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

**`server/`** (not built yet) is one Node process. It also serves the app's
files, so there is one thing to deploy. It has three parts:

- **Gate:** checks the shared password when someone connects, then gives their
  browser a session token so a refresh or reconnect doesn't ask again.
- **Table room:** the one live table. It owns the seats, turn timers,
  pre-actions, pauses between streets, and the nightly results file. Everything
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
- Hosting provider. Direction: one small always-on Node server; Cloudflare
  Durable Objects was the alternative mentioned.
- Which rules library. The user is choosing; candidates are in
  [options-considered.md](options-considered.md#rules-libraries).
