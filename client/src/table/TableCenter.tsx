import type { Card, Pot } from '@deadpan/shared';
import { AnimatedChips } from './ChipCount';
import { PlayingCard } from './PlayingCard';
import styles from './TableCenter.module.css';

interface Props {
  board: Card[];
  pots: Pot[];
  /** Cards in the winning hand; everything else on the board is dimmed. */
  bestCards: Card[] | null;
}

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;
const key = (card: Card) => card.rank + card.suit;

/** The pot and the five community card slots. */
export function TableCenter({ board, pots, bestCards }: Props) {
  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
  return (
    <div className={styles.center}>
      <div className={styles.pot} data-empty={total === 0}>
        <span className={styles.potLabel}>Pot</span>
        <AnimatedChips amount={total} />
        {pots.length > 1 && (
          <span className={styles.sidePots}>
            {pots.map((pot, i) => (
              <span key={i}>
                {i === 0 ? 'Main' : `Side ${i}`} {pot.amount.toLocaleString('en-US')}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className={styles.board}>
        {Array.from({ length: 5 }, (_, i) => {
          const card = board[i];
          if (!card) return <div key={`slot-${i}`} className={styles.slot} />;
          const inBest = bestCards?.some((best) => sameCard(best, card)) ?? false;
          return (
            <PlayingCard
              key={key(card)}
              card={card}
              faceUp
              flipOnMount
              // The flop turns over one card after another; later streets flip at once.
              delay={i < 3 ? i * 0.12 : 0}
              highlighted={inBest}
              dimmed={bestCards !== null && !inBest}
            />
          );
        })}
      </div>
    </div>
  );
}
