import type { LegalActions, PlayerAction } from '@deadpan/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import styles from './ActionBar.module.css';
import { betPresets, snapBet } from './betting';
import { formatChips } from './format';

interface Props {
  legal: LegalActions;
  currentBet: number;
  potTotal: number;
  bigBlind: number;
  onAct: (action: PlayerAction) => void;
}

/** Fold, check or call, and bet or raise, shown when it is my turn. */
export function ActionBar({ legal, currentBet, potTotal, bigBlind, onAct }: Props) {
  const { minRaiseTo, maxRaiseTo } = legal;
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(minRaiseTo ?? 0);
  const raiseVerb = currentBet === 0 ? 'Bet' : 'Raise to';

  return (
    <div className={styles.bar}>
      <AnimatePresence>
        {raising && minRaiseTo !== null && maxRaiseTo !== null && (
          <motion.div
            className={styles.raisePanel}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <div className={styles.presets}>
              {betPresets({ potTotal, currentBet, callAmount: legal.callAmount, minRaiseTo, maxRaiseTo }).map(
                (preset) => (
                  <button
                    key={preset.label}
                    className={styles.preset}
                    data-active={preset.amount === amount}
                    onClick={() => setAmount(preset.amount)}
                  >
                    {preset.label}
                  </button>
                ),
              )}
            </div>
            <div className={styles.sizer}>
              <button
                className={styles.step}
                aria-label="Less"
                onClick={() => setAmount(snapBet(amount - bigBlind, { step: bigBlind, min: minRaiseTo, max: maxRaiseTo }))}
              >
                −
              </button>
              <input
                className={styles.slider}
                type="range"
                min={minRaiseTo}
                max={maxRaiseTo}
                value={amount}
                aria-label="Bet size"
                onChange={(e) =>
                  setAmount(snapBet(Number(e.target.value), { step: bigBlind, min: minRaiseTo, max: maxRaiseTo }))
                }
              />
              <button
                className={styles.step}
                aria-label="More"
                onClick={() => setAmount(snapBet(amount + bigBlind, { step: bigBlind, min: minRaiseTo, max: maxRaiseTo }))}
              >
                +
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.buttons}>
        {raising ? (
          <button className={styles.secondary} onClick={() => setRaising(false)}>
            Back
          </button>
        ) : (
          <button className={styles.fold} disabled={!legal.canFold} onClick={() => onAct({ kind: 'fold' })}>
            Fold
          </button>
        )}
        {legal.canCheck ? (
          <button className={styles.call} onClick={() => onAct({ kind: 'check' })}>
            Check
          </button>
        ) : (
          <button className={styles.call} onClick={() => onAct({ kind: 'call' })}>
            Call {formatChips(legal.callAmount)}
          </button>
        )}
        <button
          className={styles.raise}
          disabled={minRaiseTo === null}
          onClick={() => (raising ? onAct({ kind: 'raise', to: amount }) : setRaising(true))}
        >
          {raising
            ? amount === maxRaiseTo
              ? `All-in ${formatChips(amount)}`
              : `${raiseVerb} ${formatChips(amount)}`
            : currentBet === 0
              ? 'Bet'
              : 'Raise'}
        </button>
      </div>
    </div>
  );
}
