# Design brief

Given to Claude Design on 2026-10-21 for the table mockups. Kept here as written,
so the mockups can be checked against what was asked for.

---

**Design the table UI for a private Texas Hold'em web app (phone first)**

## Context

- A private poker site for one group of friends. Play chips only, no real money. One table, 2–9 players.
- Friends open a shared link and enter a shared password, a display name and an avatar. No accounts.
- It must feel great on a phone held upright and in a desktop browser. The phone is the harder case, so design it first.
- Vibe: a clean, fun place to hang out with friends, with visuals and animations that feel great. Not casino-gaudy, not overloaded.

## Build constraint

The app will be built with React, ordinary HTML/CSS elements and the Motion animation library, plus a light effects layer for things like confetti. No 3D and no canvas game rendering. Keep everything achievable with CSS; shadows, gradients, blur and transforms are fine.

## Screens

1. Join: password, display name, avatar choice.
2. Table on a phone held upright:
   - Me at the bottom, with my two hole cards large and readable.
   - Up to 8 opponents in compact seats around the top and sides.
   - Community cards and the pot in the middle.
   - An action bar within thumb reach: Fold, Check/Call, Raise, with a bet slider and presets (½ pot, pot, all-in).
3. Table on desktop: a classic oval table with up to 9 seats and the same elements.

Each seat shows the avatar, name, chip stack, current bet, dealer button or blind marker, and status (folded, all-in, sitting out, disconnected). Empty seats say "Sit here".

## States to show (phone first, then desktop)

- My turn: a countdown ring on my seat, plus a "time bank" button for extra time.
- Waiting for others: pre-action toggles replace the action bar: Check/Fold, Check, Call [amount], Call any.
- Showdown: the winning hand highlighted and losing cards dimmed.
- All-in run-out: board cards revealed one at a time.
- Emoji reactions: a small picker, with reactions floating over a seat.

## Motion

Annotate the key moments so they can be built: dealing from the deck, card flips, chips sliding into the pot, the pot sliding to the winner, the turn timer counting down, confetti on a big pot.

## Practical

- Touch targets at least 44px. Respect the iPhone notch and home-bar safe areas.
- Cards must stay readable on small phones, down to iPhone SE width.

## Start here

Show 2–3 clearly different visual directions for the phone table in the "my turn" state. Once I pick one, expand it to the other states, the join screen and desktop.
