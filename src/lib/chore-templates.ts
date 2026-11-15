import type { Recurrence } from "./recurrence";

/**
 * Predefined tasks: picking one fills in the title, a room (when the home has a room by
 * that name) and how often. Everything stays editable, and any title can be typed instead.
 */
export type ChoreTemplate = { key: string; title: string; room: string; recurrence: Recurrence | null };

export const CHORE_TEMPLATES: readonly ChoreTemplate[] = [
  { key: "diska", title: "Diska", room: "Kök", recurrence: { unit: "day", interval: 1 } },
  { key: "toemma-diskmaskinen", title: "Tömma diskmaskinen", room: "Kök", recurrence: { unit: "day", interval: 1 } },
  { key: "torka-koeksbaenken", title: "Torka köksbänken", room: "Kök", recurrence: { unit: "day", interval: 1 } },
  { key: "ta-ut-soporna", title: "Ta ut soporna", room: "Kök", recurrence: { unit: "week", interval: 1 } },
  { key: "rensa-kylskaapet", title: "Rensa kylskåpet", room: "Kök", recurrence: { unit: "month", interval: 1 } },
  { key: "dammsuga", title: "Dammsuga", room: "Vardagsrum", recurrence: { unit: "week", interval: 1 } },
  { key: "dammtorka", title: "Damma", room: "Vardagsrum", recurrence: { unit: "week", interval: 2 } },
  { key: "vattna-blommorna", title: "Vattna blommorna", room: "Vardagsrum", recurrence: { unit: "week", interval: 1 } },
  { key: "stada-toaletten", title: "Städa toaletten", room: "Badrum", recurrence: { unit: "week", interval: 1 } },
  { key: "byta-handdukar", title: "Byta handdukar", room: "Badrum", recurrence: { unit: "week", interval: 1 } },
  { key: "byta-lakan", title: "Byta lakan", room: "Sovrum", recurrence: { unit: "week", interval: 2 } },
  { key: "baedda-saengen", title: "Bädda sängen", room: "Sovrum", recurrence: { unit: "day", interval: 1 } },
  { key: "stada-rummet", title: "Städa rummet", room: "Barnrum", recurrence: { unit: "week", interval: 1 } },
  { key: "tvaetta", title: "Tvätta", room: "Tvättstuga", recurrence: { unit: "week", interval: 1 } },
  { key: "vika-tvaett", title: "Vika tvätt", room: "Tvättstuga", recurrence: { unit: "week", interval: 1 } },
  { key: "moppa-golven", title: "Moppa golven", room: "Hall", recurrence: { unit: "week", interval: 2 } },
  { key: "klippa-graeset", title: "Klippa gräset", room: "Trädgård", recurrence: { unit: "week", interval: 1 } },
  { key: "putsa-foenster", title: "Putsa fönster", room: "Vardagsrum", recurrence: null },
];

export function findTemplate(key: string | null | undefined): ChoreTemplate | undefined {
  return key ? CHORE_TEMPLATES.find((t) => t.key === key) : undefined;
}
