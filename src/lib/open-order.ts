export type Ordered = { id: string; dueDate: string | null; undatedSince: Date | null; createdAt: Date };

/** Undated, a task waits from when it was added, or from when its date was removed. */
const waitsSince = (t: Ordered) => ((t.dueDate === null && t.undatedSince) || t.createdAt).getTime();

const compare = <T extends string | number>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The order of the open list: by day with the undated last, then by how long they have waited,
 * then by age and id. The only statement of it: the server lists the tasks with this, and the
 * browser moves a postponed one with it.
 */
export function byOpenOrder(a: Ordered, b: Ordered): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return compare(a.dueDate, b.dueDate);
  }
  return (
    compare(waitsSince(a), waitsSince(b)) ||
    compare(a.createdAt.getTime(), b.createdAt.getTime()) ||
    compare(a.id, b.id)
  );
}
