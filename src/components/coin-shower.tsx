"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { FLIGHT_MS, flightPoint, flightScale, STAGGER_MS, type Point } from "@/lib/coin-flight";
import { initialTally, isFinished, SHOWER_COINS, tallyReducer } from "@/lib/coin-tally";
import { coinsLabel, formatCoins } from "@/lib/coins";
import { openChest } from "@/app/actions";
import { withStreakBonus } from "@/lib/streak";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BADGE_COINS, BADGES } from "@/lib/badges";
import { badgeAnnouncement, levelAnnouncement } from "@/lib/celebrations";
import { CelebrationCard } from "./celebration-card";
import { ChestCard } from "./chest-card";
import { Confetti } from "./confetti";
import { MemberAvatar } from "./member-avatar";
import { CoinDot, pillClassFor } from "./coin-pill";
import { playClink, unlockSound } from "./coin-sound";

type StartOptions = {
  /** The total the pill counts up from, when the server's own is ahead of what the person has seen. */
  from?: number;
  /** No "Du fick …" announcement: something else already said it. */
  quiet?: boolean;
};

/** What a started shower reports back: whether the tick-off was saved. */
export type Shower = { saved: () => void; failed: () => void };

type Api = {
  /** `streakBonus` is for a task's own coins only: a chest's are never raised. */
  start: (origin: DOMRect, coins: number, streakBonus?: boolean, opts?: StartOptions) => Shower;
  /** The pills on the page, to bump and to land on. */
  registerPill: (pill: RefObject<HTMLElement | null>) => () => void;
  reportTotal: (total: number) => void;
  reportStreakDay: (day: number) => void;
  shown: number | null;
  glow: boolean;
  held: number;
};

const idle: Shower = { saved: () => {}, failed: () => {} };
/** Apart from the rest, so the task list does not re-render with every coin that lands. */
const StartContext = createContext<Api["start"]>(() => idle);
/** What a tick-off's chest holds, offered to the provider, which shows it once the shower has landed. */
export type Chest = { id: string; coins: number };
const OfferChestContext = createContext<(chest: Chest) => void>(() => {});
export const useOfferChest = () => useContext(OfferChestContext);

/** The badges a tick-off won and the level it reached, offered to the provider, which shows a card for each. */
export type Celebrations = {
  badges: string[];
  levelUp?: { level: number; title: string; name: string; image: string | null };
};
type Card =
  | { kind: "badge"; key: string; name: string; emoji: string }
  | { kind: "level"; level: number; title: string; name: string; image: string | null };
const OfferCelebrationsContext = createContext<(c: Celebrations) => void>(() => {});
export const useOfferCelebrations = () => useContext(OfferCelebrationsContext);
/** Nu was cleared: confetti falls over the screen. */
const NuClearedContext = createContext<() => void>(() => {});
export const useCelebrateNuCleared = () => useContext(NuClearedContext);
const Context = createContext<Api>({
  start: () => idle,
  registerPill: () => () => {},
  reportTotal: () => {},
  reportStreakDay: () => {},
  shown: null,
  glow: false,
  held: 0,
});

export const useCoinShower = () => useContext(StartContext);

/**
 * The total to show in a pill: the server's, except while a shower is playing, when the coins
 * count it up. Also hands the pill to the shower, for coins to land on.
 */
export function useShownCoins(total: number, pill: RefObject<HTMLElement | null>) {
  const { shown, glow, held, reportTotal, registerPill } = useContext(Context);
  useEffect(() => reportTotal(total), [reportTotal, total]);
  useEffect(() => registerPill(pill), [registerPill, pill]);
  // Coins of a badge card still waiting are not in the pill until the card closes.
  return { coins: shown ?? total - held, glow };
}

/** Tells the shower which streak day a tick made now falls on, so its coins include the extra. */
export function useReportStreakDay(day: number) {
  const { reportStreakDay } = useContext(Context);
  useEffect(() => reportStreakDay(day), [reportStreakDay, day]);
}

const visible = (el: HTMLElement) => el.getClientRects().length > 0;
const inView = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight;
const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const GLOW_MS = 500;
const SETTLE_MS = 1_500;
const FLOAT_LINGER_MS = 1_000;

/**
 * Plays the coin shower when a task is ticked off: five coins from the tick box to the pill, the
 * number climbing as each lands. Wrap everything that has a pill or a task in it.
 */
export function CoinShowerProvider({ children }: { children: ReactNode }) {
  const [tally, dispatch] = useReducer(tallyReducer, initialTally);
  const [server, setServer] = useState(0);
  const [glow, setGlow] = useState(false);
  const [floating, setFloating] = useState(false);
  const [chest, setChest] = useState<Chest | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [held, setHeld] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [announcement, setAnnouncement] = useState({ n: 0, text: "" });
  const pills = useRef(new Set<RefObject<HTMLElement | null>>());
  const floatRef = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const frames = useRef(new Set<number>());
  const baseline = useRef(0);
  const overriding = useRef(false);
  const serverNow = useRef(0);
  const streakDay = useRef(1);
  const heldRef = useRef(0);

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const t = timers.current;
    const f = frames.current;
    return () => {
      t.forEach(clearTimeout);
      f.forEach(cancelAnimationFrame);
    };
  }, []);

  const bump = useCallback(() => {
    const els = [...pills.current].map((p) => p.current).filter((el): el is HTMLElement => el !== null && visible(el));
    if (floatRef.current && visible(floatRef.current)) els.push(floatRef.current);
    for (const el of els) {
      el.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 180 });
    }
  }, []);

  const reportTotal = useCallback((total: number) => {
    serverNow.current = total;
    setServer(total);
  }, []);

  const reportStreakDay = useCallback((day: number) => {
    streakDay.current = day;
  }, []);

  const registerPill = useCallback((pill: RefObject<HTMLElement | null>) => {
    pills.current.add(pill);
    return () => void pills.current.delete(pill);
  }, []);

  const start = useCallback(
    (origin: DOMRect, ownCoins: number, streakBonus = true, opts: StartOptions = {}): Shower => {
      const coins = streakBonus ? withStreakBonus(ownCoins, streakDay.current) : ownCoins;
      if (coins <= 0) return idle;
      unlockSound();
      const id = nextId.current++;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!overriding.current) baseline.current = serverNow.current;
      overriding.current = true;
      dispatch({ type: "start", id, total: opts.from ?? serverNow.current - heldRef.current, coins, instant: reduced });
      if (!opts.quiet) setAnnouncement((a) => ({ n: a.n + 1, text: `Du fick ${coinsLabel(coins)}` }));
      const shower: Shower = {
        saved: () => dispatch({ type: "settle", id, saved: true }),
        failed: () => dispatch({ type: "settle", id, saved: false }),
      };

      if (reduced) {
        playClink();
        setGlow(true);
        later(() => setGlow(false), GLOW_MS);
        return shower;
      }

      const real = [...pills.current].map((p) => p.current).find((el): el is HTMLElement => el !== null && visible(el));
      const needsFloat = !real || !inView(real.getBoundingClientRect());
      if (needsFloat) setFloating(true);
      const target = () => {
        const el = needsFloat ? floatRef.current : real;
        const coin = el?.querySelector("[data-coin]") ?? el;
        return coin ? centre(coin.getBoundingClientRect()) : centre(origin);
      };
      const from = centre(origin);

      for (let i = 0; i < SHOWER_COINS; i++) {
        later(() => {
          const coin = document.createElement("div");
          coin.setAttribute("data-flying-coin", "");
          coin.className =
            "coin-dot fixed top-0 left-0 flex size-4 items-center justify-center text-sm leading-none";
          layer.current?.append(coin);
          const bend = (Math.random() - 0.5) * 30;
          const began = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - began) / FLIGHT_MS);
            const p = flightPoint(from, target(), t, bend);
            coin.style.transform = `translate(${p.x - 8}px, ${p.y - 8}px) scale(${flightScale(t)})`;
            if (t < 1) {
              const frame = requestAnimationFrame((time) => {
                frames.current.delete(frame);
                step(time);
              });
              frames.current.add(frame);
              return;
            }
            coin.remove();
            dispatch({ type: "land", id });
            bump();
            playClink();
          };
          step(began);
        }, i * STAGGER_MS);
      }
      return shower;
    },
    [bump, later],
  );

  // Once everything has landed and been saved (or not), hand the number back to the server's
  // as soon as it has caught up, or after a moment.
  const finished = isFinished(tally);
  useEffect(() => {
    if (!finished) return;
    const release = () => {
      overriding.current = false;
      dispatch({ type: "release" });
    };
    if (server !== baseline.current) {
      release();
      return;
    }
    const timer = setTimeout(release, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [finished, server]);

  // The sliding pill stays until the last coin has landed, and a moment longer.
  const landing = Object.values(tally.showers).some((s) => s.landed < SHOWER_COINS);
  useEffect(() => {
    if (!floating || landing) return;
    const timer = setTimeout(() => setFloating(false), FLOAT_LINGER_MS);
    return () => clearTimeout(timer);
  }, [floating, landing]);

  // The chest waits for the last coin of the shower; it lives here because the ticked row is gone by then.
  const chestReady = chest !== null && !landing;
  const finishChest = useCallback(
    (origin: DOMRect) => {
      if (!chest) return;
      setChest(null);
      // The ticked row is gone by now, so the dialog's close would leave focus on the page's top.
      setTimeout(() => {
        const list = document.querySelector<HTMLElement>("main");
        list?.setAttribute("tabindex", "-1");
        list?.focus({ preventScroll: true });
      }, 0);
      const shower = start(origin, chest.coins, false);
      openChest(chest.id).then(
        (result) => {
          if (result.error) {
            shower.failed();
            toast.error(result.error);
          } else shower.saved();
        },
        () => shower.failed(),
      );
    },
    [chest, start],
  );

  const offerCelebrations = useCallback(({ badges, levelUp }: Celebrations) => {
    const next: Card[] = [];
    for (const key of badges) {
      const badge = BADGES.find((b) => b.key === key);
      if (badge) next.push({ kind: "badge", key, name: badge.name, emoji: badge.emoji });
    }
    if (levelUp) next.push({ kind: "level", ...levelUp });
    if (next.length === 0) return;
    // Their coins are already in the server's total; the pill waits for the card to close.
    const coins = BADGE_COINS * next.filter((c) => c.kind === "badge").length;
    heldRef.current += coins;
    setHeld(heldRef.current);
    setCards((c) => [...c, ...next]);
  }, []);

  const celebrateNuCleared = useCallback(() => setConfetti((n) => n + 1), []);

  // Cards wait for the coin shower to land and the chest to close; badges first, then the level.
  const card = cards[0];
  const cardReady = card !== undefined && !landing && chest === null;
  const shownCard = cardReady ? card : null;

  const finishCard = useCallback(
    (origin: DOMRect) => {
      if (!card) return;
      setCards((c) => c.slice(1));
      if (card.kind === "badge") {
        const rest = heldRef.current - BADGE_COINS;
        heldRef.current = rest;
        setHeld(rest);
        start(origin, BADGE_COINS, false, { from: serverNow.current - rest - BADGE_COINS, quiet: true }).saved();
      }
      if (cards.length === 1) {
        // The card's dialog closes with focus on the page's top, so put it on the list.
        setTimeout(() => {
          const list = document.querySelector<HTMLElement>("main");
          list?.setAttribute("tabindex", "-1");
          list?.focus({ preventScroll: true });
        }, 0);
      }
    },
    [card, cards.length, start],
  );

  const api = useMemo<Api>(
    () => ({ start, registerPill, reportTotal, reportStreakDay, shown: tally.shown, glow, held }),
    [start, registerPill, reportTotal, reportStreakDay, tally.shown, glow, held],
  );
  const total = tally.shown ?? server;

  return (
    <Context.Provider value={api}>
      <StartContext.Provider value={start}>
      <OfferChestContext.Provider value={setChest}>
      <OfferCelebrationsContext.Provider value={offerCelebrations}>
      <NuClearedContext.Provider value={celebrateNuCleared}>
      {children}
      {confetti > 0 && <Confetti key={confetti} />}
      {shownCard?.kind === "badge" && (
        <CelebrationCard key={shownCard.key} title="Nytt märke!"
          announcement={badgeAnnouncement(shownCard.name)}
          picture={shownCard.emoji}
          onFinish={finishCard}>
          <p className="font-semibold">{shownCard.name}</p>
          <p className="text-xl font-bold">+{BADGE_COINS} mynt</p>
        </CelebrationCard>
      )}
      {shownCard?.kind === "level" && (
        <CelebrationCard
          key={`level-${shownCard.level}`}
          title={`Nivå ${shownCard.level}!`}
          announcement={levelAnnouncement(shownCard.level, shownCard.title)}
          picture={<MemberAvatar name={shownCard.name} image={shownCard.image} size="lg" />}
          onFinish={finishCard}
        >
          <p className="text-sm text-muted-foreground">Du är nu {shownCard.title}</p>
        </CelebrationCard>
      )}
      {chestReady && <ChestCard key={chest.id} coins={chest.coins} onFinish={finishChest} />}
      <div ref={layer} aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" />
      <div
        ref={floatRef}
        aria-hidden
        data-coin-float={floating ? "" : undefined}
        className={cn(
          pillClassFor(total),
          "pointer-events-none fixed right-3.5 z-[55] top-[max(0.75rem,env(safe-area-inset-top))] shadow-lg transition-[opacity,translate] duration-250",
          floating ? "translate-y-0 opacity-100" : "-translate-y-5 opacity-0",
          glow && "ring-3 ring-amber-200",
        )}
      >
        <CoinDot />
        {formatCoins(total)}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        <span key={announcement.n}>{announcement.text}</span>
      </div>
      </NuClearedContext.Provider>
      </OfferCelebrationsContext.Provider>
      </OfferChestContext.Provider>
      </StartContext.Provider>
    </Context.Provider>
  );
}
