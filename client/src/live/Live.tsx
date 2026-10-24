import { DEVELOPMENT_PLAYERS, type DevelopmentPlayerId } from '@deadpan/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Table } from '../table/Table';
import { createConnection } from './connection';
import styles from './Live.module.css';

interface Props {
  connection?: ReturnType<typeof createConnection>;
}

const ignore = () => {};

/** A local transport toolbar around the same snapshot-driven table as the playground. */
export function Live({ connection: supplied }: Props) {
  const [connection] = useState(() => supplied ?? createConnection({
    url: import.meta.env.VITE_SERVER_URL,
  }));
  const state = useSyncExternalStore(connection.subscribe, connection.getState, connection.getState);
  const [playerId, setPlayerId] = useState<DevelopmentPlayerId>(
    () => state.playerId ?? DEVELOPMENT_PLAYERS[0].id,
  );
  const { snapshot, pending } = state;
  const acceptedPlayerId = snapshot && snapshot.mySeat !== null
    ? snapshot.seats[snapshot.mySeat]?.player?.id : null;
  const activeConnection = state.status !== 'disconnected';
  const canRequest = state.status === 'connected' && snapshot !== null && pending === null;
  const viewingPlayer = DEVELOPMENT_PLAYERS.find((player) => player.id === state.playerId);
  const status = state.status === 'disconnected' ? 'Disconnected'
    : state.status === 'connecting' ? 'Connecting…'
    : state.status === 'identifying' ? 'Identifying…'
    : pending ? 'Waiting for server…'
    : `Connected as ${viewingPlayer?.name}`;
  const dealLabel = snapshot?.handStatus === 'complete' ? 'Deal next hand'
    : snapshot?.handStatus === 'playing' ? 'Hand in progress' : 'Deal first hand';

  // Disconnect rather than permanently dispose: React StrictMode replays effects.
  // useSyncExternalStore handles its own subscription cleanup.
  useEffect(() => () => connection.disconnect(), [connection]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <strong>deadpan / live</strong>
          <a href="/">Playground</a>
        </div>
        <p className={styles.notice}>
          Local development · Unauthenticated. Both tabs and the server must run on this computer. Not for public play.
        </p>
        <div className={styles.toolbar}>
          <label className={styles.player}>
            Development player
            <select
              value={playerId}
              disabled={activeConnection}
              onChange={(event) => setPlayerId(event.target.value as DevelopmentPlayerId)}
            >
              {DEVELOPMENT_PLAYERS.map((player) => (
                <option key={player.id} value={player.id}>{player.avatar} {player.name}</option>
              ))}
            </select>
          </label>
          {activeConnection ? (
            <button className={styles.button} onClick={() => connection.disconnect()}>Disconnect</button>
          ) : (
            <button className={styles.button} onClick={() => connection.connect(playerId)}>
              {acceptedPlayerId === playerId ? 'Reconnect' : 'Connect'}
            </button>
          )}
          <button
            className={styles.deal}
            disabled={!canRequest || snapshot?.handStatus === 'playing'}
            onClick={() => { if (snapshot) connection.deal(snapshot.seq); }}
          >
            {dealLabel}
          </button>
        </div>
        <div className={styles.feedback}>
          <span role="status" className={styles.status} data-status={state.status}>{status}</span>
          <span className={styles.server}>Server: <code>{connection.url}</code></span>
        </div>
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error.message} <span>({state.error.code})</span>
          </p>
        )}
      </header>

      {snapshot ? (
        <>
          <p className={styles.view}>
            {state.status === 'connected' ? 'View' : 'Read-only view'}: {viewingPlayer?.name} · revision {snapshot.seq}
            {' · '}{snapshot.handStatus === 'complete' ? 'Hand complete' : snapshot.handStatus === 'playing' ? 'Playing' : 'Waiting to deal'}
          </p>
          <fieldset
            className={styles.tableArea}
            disabled={!canRequest}
            aria-label="Live table controls"
            aria-busy={pending !== null}
          >
            <Table
              snapshot={snapshot}
              onAct={(action) => connection.act(action, snapshot.seq)}
              onPreAction={ignore}
              onSit={ignore}
            />
          </fieldset>
        </>
      ) : (
        <div className={styles.empty}>
          <h1>Two tabs, one local table</h1>
          <p>Select Alex in one tab and Sam in the other, then connect both.</p>
          <p>Either player can deal once both are connected and have chips. Hands have no time limit or pre-actions.</p>
          <p>Disconnecting does not fold a hand. Reconnect manually to continue; restarting the server resets the game.</p>
        </div>
      )}
    </main>
  );
}
