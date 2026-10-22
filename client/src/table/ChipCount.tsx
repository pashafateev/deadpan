import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, type CSSProperties } from 'react';
import styles from './ChipCount.module.css';
import { formatChips } from './format';

/** A chip amount that counts up or down to its new value instead of jumping. */
export function AnimatedChips({ amount }: { amount: number }) {
  const value = useMotionValue(amount);
  const text = useTransform(value, (v) => formatChips(Math.round(v)));
  useEffect(() => {
    const controls = animate(value, amount, { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [amount, value]);
  return <motion.span className={styles.number}>{text}</motion.span>;
}

/** A bet sitting on the felt in front of a player. */
export function ChipCount({ amount, className, style }: { amount: number; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      className={[styles.pill, className].filter(Boolean).join(' ')}
      style={style}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
    >
      <span className={styles.chip} aria-hidden />
      <AnimatedChips amount={amount} />
    </motion.div>
  );
}
