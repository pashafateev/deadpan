import type { Card, PlayerView, TableTurn, Winner } from '@deadpan/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AnimatedChips } from './ChipCount';
import { seatStatusLabel } from './display';
import { PlayingCard } from './PlayingCard';
import styles from './Seat.module.css';
import { TimerRing } from './TimerRing';

export type SeatSize = 'compact' | 'regular' | 'hero';

interface Props {
  player: PlayerView;
  size: SeatSize;
  /** Set only while it is this player's turn. */
  turn: TableTurn | null;
  badges: string[];
  winner?: Winner;
}

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

export function Seat({ player, size, turn, badges, winner }: Props) {
  const { cards } = player;
  const statusLabel = seatStatusLabel(player.status, Boolean(turn));
  return (
    <div
      className={styles.seat}
      data-size={size}
      data-status={player.status}
      data-acting={Boolean(turn)}
      data-winner={Boolean(winner)}
    >
      <div className={styles.cards} data-shown={cards.kind === 'shown'}>
        <AnimatePresence>
          {cards.kind !== 'none' &&
            [0, 1].map((i) => {
              const card = cards.kind === 'shown' ? cards.cards[i as 0 | 1] : undefined;
              return (
                <motion.div
                  key={i}
                  className={styles.holeCard}
                  initial={{ y: -24, opacity: 0, scale: 0.6 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -16, opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26, delay: i * 0.08 }}
                >
                  <PlayingCard
                    card={card}
                    faceUp={card !== undefined}
                    highlighted={Boolean(card && winner?.bestCards.some((best) => sameCard(best, card)))}
                  />
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>

      <div className={styles.plate}>
        <div className={styles.avatar}>
          {turn?.clock && <TimerRing clock={turn.clock} />}
          <span aria-hidden>{player.avatar}</span>
        </div>
        <div className={styles.info}>
          <span className={styles.name}>{player.name}</span>
          <span className={styles.stack}>
            <AnimatedChips amount={player.stack} />
          </span>
        </div>
        {badges.length > 0 && (
          <div className={styles.badges}>
            {badges.map((badge) => (
              <span key={badge} className={styles.badge} data-kind={badge}>
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      {statusLabel && <span className={styles.status}>{statusLabel}</span>}

      <AnimatePresence>
        {winner && (
          <motion.div
            className={styles.winnings}
            initial={{ y: 10, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.3 }}
          >
            <strong>+{winner.amount.toLocaleString('en-US')}</strong>
            {winner.handLabel && <span>{winner.handLabel}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
