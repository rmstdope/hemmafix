import { z } from "zod";

export const LOOK_KINDS = ["frame", "theme", "coin"] as const;
export type LookKind = (typeof LOOK_KINDS)[number];

export type Look = { kind: LookKind; key: string; name: string; price: number };

/** What is for sale. The first look of each kind is the free default a person starts with. */
export const LOOKS: readonly Look[] = [
  { kind: "frame", key: "none", name: "Ingen ram", price: 0 },
  { kind: "frame", key: "guld", name: "Guldram", price: 150 },
  { kind: "frame", key: "gron", name: "Grön ram", price: 150 },
  { kind: "frame", key: "rosa", name: "Rosa ram", price: 150 },
  { kind: "frame", key: "himmel", name: "Himmelsram", price: 300 },
  { kind: "theme", key: "svart", name: "Svart", price: 0 },
  { kind: "theme", key: "lila", name: "Lila", price: 200 },
  { kind: "theme", key: "skog", name: "Skog", price: 200 },
  { kind: "theme", key: "hallon", name: "Hallon", price: 200 },
  { kind: "coin", key: "guld", name: "Guld", price: 0 },
  { kind: "coin", key: "silver", name: "Silver", price: 100 },
  { kind: "coin", key: "diamant", name: "Diamant", price: 250 },
  { kind: "coin", key: "stjarna", name: "Stjärna", price: 400 },
];

export const looksOf = (kind: LookKind) => LOOKS.filter((l) => l.kind === kind);
export const defaultLook = (kind: LookKind): Look => looksOf(kind)[0]!;
export const findLook = (kind: string, key: string) => LOOKS.find((l) => l.kind === kind && l.key === key);

export const LOOKS_TITLES: Record<LookKind, string> = { frame: "Ramar", theme: "Teman", coin: "Mynt" };

const PREVIEWS: Record<LookKind, string> = {
  frame: "Så här ser din bild ut för hela familjen.",
  theme: "Så här ser Hemmafix ut för dig.",
  coin: "Så här ser dina mynt ut.",
};
export const previewText = (kind: LookKind) => PREVIEWS[kind];

export const buyLookLabel = (price: number) => `Köp för ${price} mynt`;

/** A look to buy or to switch to; the key must exist for that kind. */
export const chooseLookInput = z
  .object({ kind: z.enum(LOOK_KINDS), key: z.string() })
  .refine((v) => findLook(v.kind, v.key) !== undefined, { message: "Utseendet finns inte." });

/** What a person lacks for a look, as the tile and the sheet say it ("80 mynt kvar"). */
export const coinsLeft = (price: number, balance: number) => `${price - balance} mynt kvar`;
