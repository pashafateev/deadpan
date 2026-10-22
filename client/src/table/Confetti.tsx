import { motion } from 'motion/react';
import { useMemo } from 'react';
import styles from './Confetti.module.css';
import type { Point } from './layout';

const COLORS = ['#f4c34d', '#e2574c', '#5cc98a', '#5aa9e6', '#f3f2ee'];
const PIECES = 40;

/** A one-off burst from a point on the table, given in percent. */
export function Confetti({ origin }: { origin: Point }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 60 + Math.random() * 140;
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 60,
          rotate: Math.random() * 720 - 360,
          color: COLORS[i % COLORS.length],
          delay: 0.3 + Math.random() * 0.15,
        };
      }),
    [],
  );
  return (
    <div className={styles.origin} style={{ left: `${origin.x}%`, top: `${origin.y}%` }} aria-hidden>
      {pieces.map((piece, i) => (
        <motion.span
          key={i}
          className={styles.piece}
          style={{ background: piece.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          // Up and out first, then falling, to fake a bit of gravity.
          animate={{ x: piece.dx, y: [0, piece.dy, piece.dy + 140], opacity: [1, 1, 0], rotate: piece.rotate }}
          transition={{ duration: 1.6, delay: piece.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
