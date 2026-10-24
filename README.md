# deadpan

A private Texas Hold'em table for playing with friends, on phones and desktop.

Planning notes are in [docs/](docs/README.md), starting with
[decisions.md](docs/decisions.md). `CLAUDE.md` has the conventions for working here.

## Running it

Needs Node 26 and pnpm (the repo pins pnpm 10.32.1).

```bash
pnpm install
pnpm dev
```

This opens the playground at http://localhost:5173: a table filled with fake
data, with controls to switch between game states and player counts. The dev
server also listens on your local network, so you can open the "Network" address
it prints on your phone.

## Local two-player game

This is **unauthenticated local development**, not a version to expose publicly.
The rules engine runs on the server; browsers receive only their private table
views. The fake-data playground remains available without the server.

After `pnpm install`, use two terminals:

```bash
# Terminal 1: local game server at ws://127.0.0.1:3001
pnpm dev:server
```

```bash
# Terminal 2: Vite client
pnpm dev
```

1. Open http://localhost:5173/live in two browser tabs on the **same computer**.
   If port 5173 is occupied, use `/live` on the **Local** address Vite prints.
2. Choose Alex in one tab and Sam in the other, then connect both. Each fixed
   player can have only one active controlling tab.
3. Deal the first hand. Use the real betting controls in whichever tab has the
   turn; the other tab receives the resulting private snapshot automatically.
4. After a fold or showdown, deal another hand manually. Stacks carry forward
   and the button moves. If someone busts, restart the server to reset the
   development fixture, then deliberately reconnect both tabs.

Both players must be connected and have chips before a deal. If a tab disconnects,
its controls are disabled; reconnect manually to recover its current in-memory
view. The other tab sees the disconnected seat without changing chips or turns.
There are no turn deadlines, automatic reconnects, pre-actions, database,
or new step-by-step animations. Restarting the server loses the game.

The game server binds only `127.0.0.1`; phones cannot join this live fixture
over the network. Test phone layout by resizing a browser to 375x812. The
network-accessible fake-data playground is unaffected.

Browser WebSocket connections must originate from loopback HTTP/HTTPS pages
(`localhost`, `127.0.0.1`, or `::1`). Use Vite's **Local** address, not its
**Network** address. Native local tools can connect without an Origin header;
this is not authentication.

To use another local port, configure both ends:

```bash
# Server terminal
PORT=3002 pnpm dev:server
# Client terminal
VITE_SERVER_URL=ws://127.0.0.1:3002 pnpm dev
```

The browser uses standard WebSocket APIs and reads `VITE_SERVER_URL` at Vite
startup/build time; it defaults to `ws://127.0.0.1:3001`. No secret is required.
Production password/session access, persistent recovery, hosting, and automatic
sleep/wake are later work in issues #5, #9, #11, and #13.

Other commands:

- `pnpm test` runs the tests.
- `pnpm typecheck` checks types in every package.
- `pnpm build` builds the client.
- `pnpm --filter @deadpan/server build` typechecks and bundles the local server.
- `pnpm --filter @deadpan/server start` runs that server build.

## Layout

- `shared/` holds types used by both sides. `table.ts` defines the table snapshot
  the server will send each player; components render only from it.
- `client/` is the React app.
  - `src/table/` has the table components and the layout and betting helpers.
  - `src/playground/` has the playground page and the fake tables it shows.
  - `src/styles/tokens.css` holds the colors and sizes to change when restyling.
- `server/` holds the engine adapter, in-memory table room, and local WebSocket
  transport with unit and real-socket integration tests. It uses
  `@pokertools/engine@2.1.0`, not the upstream API application.

The server foundation partially implements issue #3. Built-client serving,
health checks, production environment/shutdown behavior, and a combined
client/server development command remain deferred; do not scaffold a second
server for those tasks.
