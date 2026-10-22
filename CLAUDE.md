# deadpan

A private Texas Hold'em web app for one group of friends: play chips, one table
of 2–9 players, phone and desktop, entry by a shared password. Read
`docs/decisions.md` first; `docs/README.md` lists the other planning docs.

## Commands

- `pnpm install`
- `pnpm dev`: the playground at http://localhost:5173, also reachable from a
  phone on the same network.
- `pnpm test`, `pnpm typecheck`, `pnpm build`

## Working here

- Components render only from `TableSnapshot` in `shared/src/table.ts`, the
  shape the server will send. Change that type rather than adding props that
  bypass it.
- Keep logic in pure functions with Vitest tests written first, like
  `client/src/table/*.test.ts`. Check components in the playground at phone
  (375×812) and desktop widths.
- Styling uses CSS Modules, with colors and sizes in
  `client/src/styles/tokens.css`. The look comes from the user's Claude Design
  mockups; the brief is `docs/design-brief.md`.
- Don't write poker rules ourselves. The user is picking a rules library; wrap
  it behind the engine adapter described in `docs/architecture.md`.
- Website only for now, but keep it Capacitor-ready: the server address is a
  setting, and only standard web APIs are used.
- The user prefers short upfront design and getting to code. Lock only what's
  expensive to change later, defer the rest, and record decisions in
  `docs/decisions.md`.
