import type { PlayerAction, PreAction, TableSnapshot } from '@deadpan/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ActionBar } from './ActionBar';
import { potTotal } from './betting';
import { ChipCount } from './ChipCount';
import { Confetti } from './Confetti';
import { arcPositions, clockwiseFrom, ellipsePositions, type Point } from './layout';
import { PreActionBar } from './PreActionBar';
import { Seat } from './Seat';
import styles from './Table.module.css';
import { TableCenter } from './TableCenter';
import { useElementSize } from './useElementSize';

interface Props {
  snapshot: TableSnapshot;
  onAct: (action: PlayerAction) => void;
  onPreAction: (preAction: PreAction | null) => void;
  onSit: (seat: number) => void;
}

// Positions are percentages of the felt area.
const PHONE_ARC = { cx: 50, cy: 57, rx: 40, ry: 44 };
const PHONE_CENTER = { x: 50, y: 72 };
const PHONE_MY_BET = { x: 50, y: 94 };
const DESKTOP_RING = { cx: 50, cy: 48, rx: 43, ry: 38 };
const DESKTOP_CENTER = { x: 50, y: 48 };

/** Bets sit this far from a seat towards the middle of the table. */
const BET_DISTANCE = 0.42;
/** From this many opponents, phone seats shrink to fit. */
const CROWDED_AT = 7;
/** Wins of at least this many big blinds get confetti. */
const BIG_POT_IN_BLINDS = 20;

const towards = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

/**
 * The whole table for one viewer. On an upright phone, opponents sit on an arc
 * and I sit below the felt; on wider screens everyone sits around an oval with
 * me at the bottom.
 */
export function Table({ snapshot, onAct, onPreAction, onSit }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [feltRef, felt] = useElementSize<HTMLDivElement>();
  const phone = size.width < 640 || size.height > size.width;
  const { seats, mySeat } = snapshot;
  const me = mySeat === null ? null : (seats[mySeat]?.player ?? null);
  const occupied = seats.filter((seat) => seat.player).map((seat) => seat.index);
  const firstEmptySeat = seats.find((seat) => !seat.player)?.index;

  let placed: { index: number; point: Point }[];
  let center: Point;
  if (phone) {
    const others = clockwiseFrom(
      occupied.filter((index) => index !== mySeat),
      mySeat,
    );
    const points = arcPositions(others.length, PHONE_ARC, felt.width ? felt.height / felt.width : 1);
    placed = others.map((index, i) => ({ index, point: points[i]! }));
    center = PHONE_CENTER;
  } else {
    const all = clockwiseFrom(
      seats.map((seat) => seat.index),
      mySeat,
    );
    const points = ellipsePositions(all.length, DESKTOP_RING);
    placed = all.map((index, i) => ({ index, point: points[i]! }));
    center = DESKTOP_CENTER;
  }

  const seatPoint = (index: number): Point =>
    placed.find((p) => p.index === index)?.point ?? (index === mySeat ? PHONE_MY_BET : center);
  const betPoint = (index: number): Point =>
    phone && index === mySeat ? PHONE_MY_BET : towards(seatPoint(index), center, BET_DISTANCE);
  const turnFor = (index: number) => (snapshot.turn?.seat === index ? snapshot.turn : null);
  const winnerFor = (index: number) => snapshot.winners.find((winner) => winner.seat === index);
  const badgesFor = (index: number) =>
    [
      index === snapshot.buttonSeat && 'D',
      index === snapshot.smallBlindSeat && 'SB',
      index === snapshot.bigBlindSeat && 'BB',
    ].filter((badge): badge is string => Boolean(badge));

  const bestCards = snapshot.winners.find((winner) => winner.bestCards.length > 0)?.bestCards ?? null;
  const bigWin = snapshot.winners.find((winner) => winner.amount >= BIG_POT_IN_BLINDS * snapshot.blinds.big);
  const betsOnTable = seats.map((seat) => seat.player?.bet ?? 0);
  const percent = ({ x, y }: Point) => ({ left: `${x}%`, top: `${y}%` });

  return (
    <div ref={ref} className={styles.table} data-layout={phone ? 'phone' : 'desktop'}>
      <div ref={feltRef} className={styles.feltArea} data-crowded={phone && placed.length >= CROWDED_AT}>
        <div className={styles.felt} />

        <div className={styles.center} style={percent(center)}>
          <TableCenter board={snapshot.board} pots={snapshot.pots} bestCards={bestCards} />
        </div>

        <AnimatePresence>
          {seats.map((seat) =>
            seat.player && seat.player.bet > 0 ? (
              <ChipCount
                key={`bet-${seat.index}`}
                className={styles.bet}
                style={percent(betPoint(seat.index))}
                amount={seat.player.bet}
              />
            ) : null,
          )}
        </AnimatePresence>

        {placed.map(({ index, point }) => {
          const player = seats[index]?.player;
          return (
            <motion.div
              key={index}
              className={styles.slot}
              initial={false}
              animate={percent(point)}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            >
              {player ? (
                <Seat
                  player={player}
                  size={phone ? 'compact' : index === mySeat ? 'hero' : 'regular'}
                  turn={turnFor(index)}
                  badges={badgesFor(index)}
                  winner={winnerFor(index)}
                />
              ) : mySeat === null ? (
                <button className={styles.sitHere} onClick={() => onSit(index)}>
                  Sit here
                </button>
              ) : (
                <div className={styles.emptySeat} />
              )}
            </motion.div>
          );
        })}

        <div className={styles.effects}>
          {bigWin && <Confetti key={`${snapshot.seq}-${bigWin.seat}`} origin={seatPoint(bigWin.seat)} />}
        </div>
      </div>

      {phone && (
        <div className={styles.hero}>
          {me && mySeat !== null ? (
            <Seat
              player={me}
              size="hero"
              turn={turnFor(mySeat)}
              badges={badgesFor(mySeat)}
              winner={winnerFor(mySeat)}
            />
          ) : (
            firstEmptySeat !== undefined && (
              <button className={styles.sitDown} onClick={() => onSit(firstEmptySeat)}>
                Sit down
              </button>
            )
          )}
        </div>
      )}

      <div className={styles.controls}>
        {me && snapshot.legalActions ? (
          <ActionBar
            key={snapshot.seq}
            legal={snapshot.legalActions}
            currentBet={snapshot.currentBet}
            potTotal={potTotal(snapshot.pots, betsOnTable)}
            bigBlind={snapshot.blinds.big}
            onAct={onAct}
          />
        ) : me && me.status === 'active' && snapshot.street !== null && snapshot.street !== 'showdown' ? (
          <PreActionBar
            callAmount={Math.min(snapshot.currentBet - me.bet, me.stack)}
            preAction={snapshot.preAction}
            onChange={onPreAction}
          />
        ) : null}
      </div>
    </div>
  );
}
