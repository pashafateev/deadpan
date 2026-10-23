# Spec Delta

## Purpose

Run authoritative no-limit Texas Hold'em hands and give each player a private,
actionable view of the table, from the initial deal through settlement and the
next hand.

## ADDED Requirements

### Requirement: Local two-player development table

The application SHALL provide a live development screen where two browser tabs
can control distinct fixed players at one local table. Both players SHALL start
with the same configured stack and use fixed blinds. The existing fake-data
playground SHALL remain available independently.

#### Scenario: Open two player views
- **WHEN** two tabs select different development players and connect
- **THEN** both display the same table with their respective viewer seat
- **AND** neither connection resets the table or deals a hand automatically

#### Scenario: Keep visual development independent
- **WHEN** the developer opens the fake-data playground without a game server
- **THEN** the existing scenario and player-count controls remain usable

### Requirement: Manual hand lifecycle

The server SHALL accept a manual deal request only before the first hand or after
the previous hand has settled, with both development players connected and able
to post chips. A subsequent deal SHALL preserve the settled stacks and advance
the dealer button according to heads-up rules.

#### Scenario: Deal the first hand
- **WHEN** either connected player requests a deal while both players can play
  and no hand has begun
- **THEN** the server posts blinds, deals cards, and publishes the opening turn

#### Scenario: Continue after settlement
- **WHEN** a player requests another hand after a completed hand and both players
  still have chips
- **THEN** the next hand uses the previous final stacks and the next dealer button
- **AND** the previous board and winner display are cleared

#### Scenario: Reject an unavailable deal
- **WHEN** a deal is requested during a hand, without both players connected, or
  when either player has no chips
- **THEN** the server rejects the request without changing chips or the hand

### Requirement: Server-authoritative player actions

The server SHALL bind each connection to one development player and accept
fold, check, call, or raise requests only for that player's legal turn. Bet and
raise amounts SHALL represent total chips committed on the current street.
Rejected requests SHALL leave the game unchanged and return a useful error.

#### Scenario: Apply a legal action
- **WHEN** the acting player requests a legal check, call, fold, bet, or raise
- **THEN** the server applies it and publishes the resulting table to both players

#### Scenario: Interpret a raise amount
- **WHEN** a player who has committed 10 chips on the street legally raises to 60
- **THEN** their street contribution becomes 60 and their stack decreases by 50

#### Scenario: Reject an invalid request
- **WHEN** a connection is unidentified, acts for a nonacting player, sends a
  malformed message, or requests an illegal action or amount
- **THEN** no game state changes and the requester receives an error
- **AND** the server remains able to process a subsequent valid request

### Requirement: Revision-checked state changes

Every action and deal request SHALL identify the table revision it was based on.
The server SHALL reject requests for an older or otherwise mismatched revision.
Each accepted state-changing request SHALL advance the revision and publish
viewer-specific snapshots at the same new revision.

#### Scenario: Ignore a duplicate action
- **WHEN** the same action is submitted twice for the same revision
- **THEN** at most one submission changes the game
- **AND** the other is rejected without advancing the revision

#### Scenario: Reject a delayed deal
- **WHEN** a deal request arrives after another request has already started a hand
- **THEN** the delayed request cannot deal again or reset the new hand

### Requirement: Private player views

Each player's snapshot SHALL expose only that player's permitted hole cards and
public table information. Opponents' unrevealed cards, folded opponents' cards,
and undealt cards SHALL be absent from all messages sent to that viewer, not
merely hidden by the UI.

#### Scenario: Hide an opponent's hand
- **WHEN** a hand is in progress before showdown
- **THEN** each player's messages contain their own visible hole cards but no
  values for the opponent's hidden cards or the remaining deck

#### Scenario: Reveal a contested showdown
- **WHEN** two players reach showdown without folding
- **THEN** the completed snapshot reveals both contesting hands
- **AND** it identifies the winner or split result

#### Scenario: Preserve privacy after a fold
- **WHEN** a hand ends because one player folds
- **THEN** neither player's hole cards are newly revealed to the other player
- **AND** messages do not expose folded cards through result or error details

### Requirement: Actionable table snapshots

Snapshots SHALL identify hand lifecycle, acting seat, street, board, stacks,
street bets, collected pots, and settled winners. Only the acting viewer SHALL
receive legal actions, including the payable call amount and permitted raise
totals. An untimed active turn SHALL be distinguishable from no active turn.

#### Scenario: Display the current decision
- **WHEN** the server publishes an active turn
- **THEN** both players can identify the acting seat without a countdown
- **AND** only that viewer receives actionable betting controls

#### Scenario: Wait without unsupported pre-actions
- **WHEN** a live development player is waiting for the opponent's action
- **THEN** the table indicates whose turn it is without offering pre-actions

#### Scenario: Represent a short call
- **WHEN** the acting player's remaining stack is less than the amount needed to
  match the highest street bet
- **THEN** the displayed call amount is the amount they can actually contribute
- **AND** the resulting action is handled as an all-in call

#### Scenario: Represent a completed hand
- **WHEN** the hand has settled
- **THEN** snapshots indicate completion with no acting turn or legal actions
- **AND** the UI offers no betting or pre-action controls for that hand

### Requirement: Correct betting and settlement

Hand progression and settlement SHALL follow standard no-limit Texas Hold'em
rules, including heads-up blinds, all-in runouts, side-pot eligibility, short
all-in reopening rules, uncalled-chip returns, and split-pot remainders. Chips
SHALL be conserved, and paid-out chips SHALL not remain counted in live pots.

#### Scenario: Handle heads-up action order
- **WHEN** a two-player hand starts
- **THEN** the dealer posts the small blind and acts first preflop
- **AND** the other player acts first on subsequent betting streets

#### Scenario: Settle an uncontested hand
- **WHEN** all but one player have folded
- **THEN** the remaining player receives the pot without further betting
- **AND** all final stacks account for returned and awarded chips exactly once

#### Scenario: Run out an all-in hand
- **WHEN** no further betting decisions are possible before the river
- **THEN** the remaining board is dealt and the hand settles without more player
  input or a fabricated turn

#### Scenario: Apply a short all-in
- **WHEN** a short all-in leaves a previously acting player facing less than a
  full raise since their last action
- **THEN** that player can call or fold but cannot reraise

#### Scenario: Settle unequal all-ins
- **WHEN** an exercised three-player hand has unequal all-in contributions
- **THEN** each pot is awarded only among its eligible players
- **AND** unmatched contributions are returned
- **AND** final stacks conserve the starting chip total

#### Scenario: Split a pot with an odd chip
- **WHEN** tied eligible players split a pot that cannot be divided evenly
- **THEN** the remainder is awarded according to standard button-relative order
- **AND** no chip is created or lost

### Requirement: Client follows authoritative state

The live client SHALL render game state only from received snapshots, without
optimistic chip or card changes. It SHALL suppress repeated submissions while a
request is pending, display request errors, and disable game requests when its
connection is unavailable. It SHALL support a configurable server address.

#### Scenario: Wait for an action result
- **WHEN** a player submits an action
- **THEN** the client prevents another submission until a response resolves it
- **AND** stacks, board, and winners change only when a snapshot arrives

#### Scenario: Lose the server connection
- **WHEN** the connection closes during a hand
- **THEN** the client displays a disconnected state and disables game requests
- **AND** it does not auto-act, locally advance the hand, or claim to reconnect

#### Scenario: Use a configured server
- **WHEN** the developer supplies a server address through configuration
- **THEN** the live screen connects to that address rather than requiring the
  page's origin to host the game server

### Requirement: Development-only access boundary

The game server SHALL accept local loopback connections only for this milestone.
Each fixed development player SHALL have at most one active controlling
connection. The development screen SHALL identify this unauthenticated mode as
unsuitable for remote or public play.

#### Scenario: Attempt duplicate control
- **WHEN** another connection selects a development player that is already
  controlled by an active connection
- **THEN** the new connection is rejected without replacing the existing one

#### Scenario: Run the development server
- **WHEN** the game server starts with its supported development configuration
- **THEN** it does not listen on a public or local-network interface
- **AND** the live screen labels the mode as local development
