# Options considered

Alternatives looked at during planning (2026-10-17 to 2026-10-21) and why they
were or weren't picked. Facts about outside projects were checked at the time
and may have changed since.

## Drawing the table

| Option | Notes | Verdict |
|---|---|---|
| **Regular page elements animated with Motion**, plus a thin effects layer | Sharp text and cards at any size; easiest to give phone and desktop their own layouts; controls are normal, thumb-friendly elements. Timing, motion and sound do most of the work of making it feel good. | **Chosen** |
| 2D game canvas (PixiJS) | Better for heavy effects like glows and lots of particles. Layout for different screens becomes our job, and controls end up as page elements anyway, so the UI gets built twice. Roughly 1–2 extra weeks. | No |
| 3D table (Three.js) | Biggest wow factor. Hardest on phones (battery, heat, small cards harder to read), needs 3D models, and a 3D camera fits an upright phone awkwardly. Roughly 3–4 extra weeks. | No |

## Platforms

| Option | What it makes | Verdict |
|---|---|---|
| **Website, installable to the home screen** | Runs everywhere from one link; opens full-screen with its own icon | **Chosen** |
| Capacitor | iOS and Android apps from the same web code | Possible later; stay ready for it |
| Electron | Desktop apps only | No: no phones, and the browser covers desktop |
| Tauri 2 | Desktop, plus newer iOS and Android support | No: less mature on mobile than Capacitor, and its own code is Rust |
| React Native (Expo) | Native iOS and Android, plus web | No: drops the page-elements approach, and its web version is the weakest |
| Flutter | Everything | No: different language (Dart), heavier web version |

Why not app stores now:

- Apple charges $99 a year, reviews every update, and sometimes rejects apps
  that are mostly a wrapped website. Without a public listing, builds go out
  through TestFlight, and those expire every 90 days.
- Google Play is a $25 one-time fee; Android friends could also install the app
  file directly.
- Since iOS 16.4, home-screen web apps on iPhone can get notifications.
- What a Capacitor wrapper would add: iPhone haptics (web apps can't vibrate on
  iPhone), more reliable notifications, and a store listing.

Staying Capacitor-ready costs almost nothing: make the server address a
setting, and stick to standard web features.

## Rules libraries

**Selected: `@pokertools/engine@2.1.0`, engine only.** The user approved switching
after the initial `poker-ts@1.5.0` checks failed. A focused sandbox evaluation
passed 16 rules tests (including 200 repeatable sample hands), recovery/privacy
diagnostics, and a TypeScript 7.0.2 import check. This is not a complete audit;
keep these scenarios in adapter regression tests.

`poker-ts` incorrectly reopened betting after a short all-in and removed an
all-in player from main-pot eligibility when opponents bet on a later street.
It also lacks a supported snapshot/restore or deterministic-deck API. We are
not maintaining a rules fork to fix these.

The upstream `@pokertools/api` is a separate, private-package application with
authentication, persistence, Redis/workers, and financial integrations. We are
not adopting that architecture: the engine works with our own one-process
WebSocket server and snapshot format.

Historical comparison, investigated on 2026-10-17 (usage figures are not current):

- **[@pokertools/engine](https://www.npmjs.com/package/@pokertools/engine)**
  (MIT): first release November 2025, actively updated, one maintainer, about
  260 downloads a week. It's a pure reducer, `(state, action) => state`, with
  per-player views that hide opponents' cards, snapshot and restore, side pots,
  a time bank, and hand-history export. Hand ranking is in a separate
  `@pokertools/evaluator` package. Timeout and auto-action behavior wasn't
  documented.
- **[poker-ts](https://github.com/claudijo/poker-ts)** (MIT): since 2021, a
  port of an older C++ library, last release September 2025, about 150
  downloads a week. Handles side pots, legal actions with bet ranges, blinds
  and antes, and showdown, and has built-in automatic actions (fold, check/fold,
  check, call, call any, all-in). It uses a mutable `Table` class and has no
  per-player view, so the server would hide cards itself. Integer chips only.
- **[pokersolver](https://github.com/goldfire/pokersolver)** (MIT): hand ranking
  only. Old but widely used, about 7,400 downloads a week.
- **[PokerKit](https://pokerkit.readthedocs.io)**: Python, from a University of
  Toronto research group, the most rigorous of the lot, but a different
  language from the rest of the project.

Complete open-source poker apps also exist, such as
[cloxnu/Poker](https://github.com/cloxnu/Poker) (React, NestJS, Socket.io) and
PokerTH. Forking one would get something running sooner but means inheriting
its look and layout, which is the part this project cares most about. Neither
was checked for quality.

Test the selected library against tricky hands before relying on
it: a three-way all-in with different stacks, a short all-in, heads-up blinds,
a split pot with an odd chip, and an uncalled bet being returned.

## Real-time server

| Option | Verdict |
|---|---|
| **One small Node server with WebSockets**, holding the table in memory | **Direction** |
| Cloudflare Durable Objects | More elegant, more to learn |
| A shared real-time database (Firebase-style) | No: can't keep hole cards hidden |

## Styling

**CSS Modules with CSS variables** were chosen so the Claude Design mockups drop
in mostly by changing variables in `client/src/styles/tokens.css`. Tailwind
would have worked too.
