import type { TurnClock } from '@deadpan/shared';
import { motion } from 'motion/react';
import styles from './TimerRing.module.css';

/** A ring around the avatar that drains as the turn clock runs out. */
export function TimerRing({ clock }: { clock: TurnClock }) {
  const remainingMs = Math.max(0, clock.startedAt + clock.durationMs - Date.now());
  return (
    <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden>
      <circle className={styles.track} cx="50" cy="50" r="46" />
      <motion.circle
        // Remount when a new turn starts so the ring refills.
        key={clock.startedAt}
        className={styles.progress}
        cx="50"
        cy="50"
        r="46"
        initial={{ pathLength: remainingMs / clock.durationMs }}
        animate={{ pathLength: 0 }}
        transition={{ duration: remainingMs / 1000, ease: 'linear' }}
      />
    </svg>
  );
}
