# deadpan

A private Texas Hold'em table for playing with friends, on phones and desktop.

Planning notes are in [docs/](docs/README.md), starting with
[decisions.md](docs/decisions.md). `CLAUDE.md` has the conventions for working here.

## Running it

Needs Node and pnpm.

```bash
pnpm install
pnpm dev
```

This opens the playground at http://localhost:5173: a table filled with fake
data, with controls to switch between game states and player counts. The dev
server also listens on your local network, so you can open the "Network" address
it prints on your phone.

Other commands:

- `pnpm test` runs the tests.
- `pnpm typecheck` checks types in every package.
- `pnpm build` builds the client.

## Layout

- `shared/` holds types used by both sides. `table.ts` defines the table snapshot
  the server will send each player; components render only from it.
- `client/` is the React app.
  - `src/table/` has the table components and the layout and betting helpers.
  - `src/playground/` has the playground page and the fake tables it shows.
  - `src/styles/tokens.css` holds the colors and sizes to change when restyling.
- `server/` doesn't exist yet.
