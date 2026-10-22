import type { PlayerAction, PreAction } from '@deadpan/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { formatChips } from '../table/format';
import { Table } from '../table/Table';
import { makeSnapshot, SCENARIOS, type Scenario } from './mocks';
import styles from './Playground.module.css';

const DONE: Record<Exclude<PlayerAction['kind'], 'raise'>, string> = {
  fold: 'You folded',
  check: 'You checked',
  call: 'You called',
};

const describe = (action: PlayerAction) =>
  action.kind === 'raise' ? `You raised to ${formatChips(action.to)}` : DONE[action.kind];

/** A table driven by fake data, for working on the look without a server. */
export function Playground() {
  const [scenario, setScenario] = useState<Scenario>('my-turn');
  const [playerCount, setPlayerCount] = useState(6);
  const [deal, setDeal] = useState(0);
  const [preAction, setPreAction] = useState<PreAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [boardShown, setBoardShown] = useState(5);

  const snapshot = useMemo(
    () => makeSnapshot(scenario, playerCount, deal, Date.now()),
    [scenario, playerCount, deal],
  );

  // In the all-in run-out, the turn and river arrive one at a time.
  useEffect(() => {
    if (scenario !== 'all-in') {
      setBoardShown(5);
      return;
    }
    setBoardShown(3);
    const turn = setTimeout(() => setBoardShown(4), 1400);
    const river = setTimeout(() => setBoardShown(5), 2800);
    return () => {
      clearTimeout(turn);
      clearTimeout(river);
    };
  }, [scenario, deal]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const choose = (next: Scenario) => {
    setScenario(next);
    setPreAction(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <strong className={styles.title}>deadpan</strong>
        <select
          className={styles.select}
          value={scenario}
          onChange={(e) => choose(e.target.value as Scenario)}
          aria-label="Scenario"
        >
          {Object.entries(SCENARIOS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className={styles.stepper} aria-label="Players">
          <button onClick={() => setPlayerCount((n) => Math.max(2, n - 1))} aria-label="Fewer players">
            −
          </button>
          <span>{playerCount} players</span>
          <button onClick={() => setPlayerCount((n) => Math.min(9, n + 1))} aria-label="More players">
            +
          </button>
        </div>
        <button className={styles.replay} onClick={() => setDeal((d) => d + 1)}>
          Deal again
        </button>
      </div>

      <div className={styles.tableArea}>
        <Table
          key={deal}
          snapshot={{ ...snapshot, board: snapshot.board.slice(0, boardShown), preAction }}
          onAct={(action) => {
            setToast(describe(action));
            choose('waiting');
          }}
          onPreAction={setPreAction}
          onSit={() => choose('my-turn')}
        />
        <AnimatePresence>
          {toast && (
            <motion.div
              className={styles.toast}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
