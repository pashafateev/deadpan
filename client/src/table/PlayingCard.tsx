import type { Card } from '@deadpan/shared';
import { motion } from 'motion/react';
import { isRed, rankLabel, suitSymbol } from './format';
import styles from './PlayingCard.module.css';

interface Props {
  /** Omit for a card whose face this viewer can't see. */
  card?: Card;
  faceUp: boolean;
  /** Start face down and flip over once mounted, e.g. when dealt to the board. */
  flipOnMount?: boolean;
  delay?: number;
  highlighted?: boolean;
  dimmed?: boolean;
  className?: string;
}

export function PlayingCard({ card, faceUp, flipOnMount, delay = 0, highlighted, dimmed, className }: Props) {
  const showFace = faceUp && card !== undefined;
  return (
    <motion.div
      className={[styles.card, className].filter(Boolean).join(' ')}
      animate={{ y: highlighted ? -8 : 0, opacity: dimmed ? 0.4 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <motion.div
        className={styles.inner}
        initial={flipOnMount ? { rotateY: 180 } : false}
        animate={{ rotateY: showFace ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, delay }}
      >
        <div className={`${styles.face} ${highlighted ? styles.highlighted : ''}`} data-red={card && isRed(card.suit)}>
          {card && (
            <>
              <span className={styles.corner}>
                {rankLabel(card.rank)}
                <br />
                {suitSymbol(card.suit)}
              </span>
              <span className={styles.pip}>{suitSymbol(card.suit)}</span>
            </>
          )}
        </div>
        <div className={styles.back} />
      </motion.div>
    </motion.div>
  );
}
