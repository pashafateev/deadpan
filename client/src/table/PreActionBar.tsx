import type { PreAction } from '@deadpan/shared';
import { formatChips } from './format';
import styles from './PreActionBar.module.css';

interface Props {
  /** What it would cost me to call right now. */
  callAmount: number;
  preAction: PreAction | null;
  onChange: (preAction: PreAction | null) => void;
}

/** Actions I can queue while waiting for my turn. Tapping the selected one clears it. */
export function PreActionBar({ callAmount, preAction, onChange }: Props) {
  const facingBet = callAmount > 0;
  const options: { action: PreAction; label: string }[] = [
    { action: { kind: 'check-fold' }, label: facingBet ? 'Fold' : 'Check / Fold' },
    facingBet
      ? { action: { kind: 'call', amount: callAmount }, label: `Call ${formatChips(callAmount)}` }
      : { action: { kind: 'check' }, label: 'Check' },
    { action: { kind: 'call-any' }, label: 'Call any' },
  ];
  const isSelected = (action: PreAction) =>
    preAction?.kind === action.kind &&
    (action.kind !== 'call' || (preAction.kind === 'call' && preAction.amount === action.amount));

  return (
    <div className={styles.bar} role="group" aria-label="Act in advance">
      {options.map(({ action, label }) => {
        const selected = isSelected(action);
        return (
          <button
            key={action.kind}
            className={styles.option}
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : action)}
          >
            <span className={styles.box} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
