# Scope

Estimates from planning, 2026-10-17 to 2026-10-21. Sizes are focused full-time
work for one developer; for evenings and weekends, multiply by about 3. AI help
shrinks the code-heavy rows a lot and the animation row much less, because that
time goes into trying things and judging how they feel.

## The pieces

| Piece | What it involves | Rough size |
|---|---|---|
| Rules engine | Pick an existing library, wrap it behind an adapter, test tricky hands | 2–4 days |
| Game server | Runs the table: seats, turns, sitting out, rebuys, reconnecting | 1–2 weeks |
| Password gate | One shared password, remembered by the browser | about 1 day |
| Timing and auto-actions | Turn timer, time bank, timeouts, pre-action buttons, pauses between streets | 3–5 days |
| Table UI | Phone and desktop layouts, action bar, bet slider (first pass in PR #1) | 1–2 weeks |
| Animation and sound | Dealing, flips, chips moving, showdown reveal, sound effects | 2–4+ weeks |
| Lobby | Name, avatar, sitting down | a few days |
| Hangout extras | Emoji reactions, chat, session stats | a few days each |
| Hosting | One small always-on server | 1–2 days |

A plain but playable version is about **3–5 weeks**. The polish on top is
another **2–4+ weeks** and keeps growing as long as you let it.

## Where it gets harder than expected

1. **Hidden cards.** The server must run the game and send each player only
   their own cards. That rules out keeping the whole game in a shared real-time
   database like Firebase, where anyone could read everyone's hand from the
   browser's developer tools.
2. **Side pots and edge cases.** Three-way all-ins with different stacks, an
   all-in too small to count as a full raise (it doesn't reopen betting), odd
   leftover chips in a split pot, and the different blind order heads-up. Easy
   to get subtly wrong, so this is where tests pay off most.
3. **Phones dropping the connection.** iPhones cut the connection when someone
   switches apps. The game has to let them rejoin cleanly and auto-check or
   auto-fold when their timer runs out.
4. **Phone layout.** Nine seats around an oval don't fit an upright phone. The
   first pass in PR #1 puts opponents on an arc above the board and you below
   it, and shrinks seats from 7 opponents up.
5. **Animation timing.** The server knows an all-in result instantly, but
   players should see the flop, turn and river land one at a time. The client
   needs an event player that plays events in order, separate from the game
   state. Cheap to build in from the start, painful to add later.

## Stages

1. **Rules engine:** the chosen library, wrapped and tested, with no screens.
2. **Ugly but playable online:** share a link and play a full evening on phones
   and laptops. This is the real milestone; everything after is polish.
3. **Look and feel:** layout, animation and sound, following the mockups.
4. **Hangout extras.**

## Out of scope for now

- Real money: a legal minefield.
- App Store and Play Store apps: see [options-considered.md](options-considered.md#platforms).
- Accounts and individual passwords.
- Built-in voice chat: Discord does this better.
- Tournaments and multiple tables.

## Later

- Comparing results across game nights. The server should save each night's
  buy-ins and final stacks to a file from day one, so there is history to
  compare when this gets built.
