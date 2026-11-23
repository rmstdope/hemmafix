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
import { cn } from "@/lib/utils";
import { CoinDot, coinPillClass } from "./coin-pill";
import { playClink } from "./coin-sound";

/** What a started shower reports back: whether the tick-off was saved. */
export type Shower = { saved: () => void; failed: () => void };

type Api = {
  start: (origin: DOMRect, coins: number) => Shower;
  /** The pills on the page, to bump and to land on. */
  registerPill: (pill: RefObject<HTMLElement | null>) => () => void;
  reportTotal: (total: number) => void;
  shown: number | null;
  glow: boolean;
};

const idle: Shower = { saved: () => {}, failed: () => {} };
const Context = createContext<Api>({
  start: () => idle,
  registerPill: () => () => {},
  reportTotal: () => {},
  shown: null,
  glow: false,
});

export const useCoinShower = () => useContext(Context).start;

/**
 * The total to show in a pill: the server's, except while a shower is playing, when the coins
 * count it up. Also hands the pill to the shower, for coins to land on.
 */
export function useShownCoins(total: number, pill: RefObject<HTMLElement | null>) {
  const { shown, glow, reportTotal, registerPill } = useContext(Context);
  useEffect(() => reportTotal(total), [reportTotal, total]);
  useEffect(() => registerPill(pill), [registerPill, pill]);
  return { coins: shown ?? total, glow };
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
  const [announcement, setAnnouncement] = useState({ n: 0, text: "" });
  const pills = useRef(new Set<RefObject<HTMLElement | null>>());
  const floatRef = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const frames = useRef(new Set<number>());
  const flying = useRef(0);
  const baseline = useRef(0);
  const overriding = useRef(false);
  const serverNow = useRef(0);

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

  const registerPill = useCallback((pill: RefObject<HTMLElement | null>) => {
    pills.current.add(pill);
    return () => void pills.current.delete(pill);
  }, []);

  const start = useCallback(
    (origin: DOMRect, coins: number): Shower => {
      if (coins <= 0) return idle;
      const id = nextId.current++;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!overriding.current) baseline.current = serverNow.current;
      overriding.current = true;
      dispatch({ type: "start", id, total: serverNow.current, coins, instant: reduced });
      setAnnouncement((a) => ({ n: a.n + 1, text: `Du fick ${coinsLabel(coins)}` }));
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
      flying.current += SHOWER_COINS;

      for (let i = 0; i < SHOWER_COINS; i++) {
        later(() => {
          const coin = document.createElement("div");
          coin.setAttribute("data-flying-coin", "");
          coin.className =
            "fixed top-0 left-0 size-4 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fde68a,#f59e0b_70%,#b45309)] shadow-[inset_0_0_0_1.5px_#d97706,0_1px_3px_rgba(0,0,0,.2)]";
          layer.current?.append(coin);
          const bend = (Math.random() - 0.5) * 30;
          const began = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - began) / FLIGHT_MS);
            const p = flightPoint(from, target(), t, bend);
            coin.style.transform = `translate(${p.x - 8}px, ${p.y - 8}px) scale(${flightScale(t)})`;
            if (t < 1) {
              frames.current.add(requestAnimationFrame(step));
              return;
            }
            coin.remove();
            flying.current -= 1;
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

  const api = useMemo<Api>(
    () => ({ start, registerPill, reportTotal, shown: tally.shown, glow }),
    [start, registerPill, reportTotal, tally.shown, glow],
  );
  const total = tally.shown ?? server;

  return (
    <Context.Provider value={api}>
      {children}
      <div ref={layer} aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" />
      <div
        ref={floatRef}
        aria-hidden
        data-coin-float={floating ? "" : undefined}
        className={cn(
          coinPillClass,
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
    </Context.Provider>
  );
}
