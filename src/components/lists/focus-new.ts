/**
 * Skapa opens the new list with focus in its field. The list's page picks this up on arrival:
 * a module variable, because the page is reached by a client-side navigation and the address
 * should stay clean.
 */
let pending: string | null = null;

export const expectFocusIn = (listId: string) => {
  pending = listId;
};

/** True once for the list that was just made. */
export function takeFocus(listId: string) {
  const mine = pending === listId;
  if (mine) pending = null;
  return mine;
}
