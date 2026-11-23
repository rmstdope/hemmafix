import { formatCoins } from "./coins";

/** What the undo question says: who it is about and the balance they would end at (below zero). */
export type UndoDebt = { own: boolean; name: string; balance: number };

export const undoDebtTitle = ({ own, name }: UndoDebt) => (own ? "Mynten är redan använda" : `${name} har redan använt mynten`);

export const undoDebtText = ({ own, name, balance }: UndoDebt) =>
  own
    ? `Ångra ändå? Du får ${formatCoins(balance)} mynt och kan inte köpa något förrän du har tjänat ihop dem igen.`
    : `Ångra ändå? ${name} får ${formatCoins(balance)} mynt och kan inte köpa något förrän ${name} har tjänat ihop dem igen.`;

/** The card on top of Butik while the balance is below zero. */
export const debtCardTitle = (balance: number) => `Du har ${formatCoins(balance)} mynt`;
export const debtCardText = (balance: number) => `Tjäna ${formatCoins(-balance)} mynt till innan du kan köpa något.`;
