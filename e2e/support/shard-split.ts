/** What the split needs to know about a test. */
export type ShardTest = {
  /** The test without its project: file, suites and title. */
  key: string;
  project: string;
  /** How long it takes; unknown weighs `DEFAULT_SECONDS`. */
  seconds: number | undefined;
  /** Tests with the same value run in the same shard. */
  together?: string;
};

/** About the average of the tests too quick to be listed in `test-times.json`. */
export const DEFAULT_SECONDS = 0.8;

/** Plain code unit order: the same on every machine, whatever its locale. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Splits the tests into `total` shards of about equal time: the heaviest first, each into the
 * lightest shard so far. Every shard runs this by itself over the whole suite, so the result
 * must depend on nothing but the tests, not even on their order. Within a shard they keep the
 * order they came in.
 */
export function splitIntoShards<T>(tests: T[], total: number, info: (test: T) => ShardTest): T[][] {
  const units = new Map<unknown, { id: string; seconds: number; tests: T[] }>();
  for (const test of tests) {
    const { key, project, seconds = DEFAULT_SECONDS, together } = info(test);
    const id = `${key}\n${project}`;
    // A suite runs in each project on its own, so the project is part of what holds it together.
    const unitKey = together === undefined ? test : `${together}\n${project}`;
    const unit = units.get(unitKey);
    if (!unit) units.set(unitKey, { id, seconds, tests: [test] });
    else {
      unit.id = compare(id, unit.id) < 0 ? id : unit.id;
      unit.seconds += seconds;
      unit.tests.push(test);
    }
  }
  const shards = Array.from({ length: total }, () => ({ seconds: 0, tests: new Set<T>() }));
  for (const unit of [...units.values()].sort((a, b) => b.seconds - a.seconds || compare(a.id, b.id))) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
    lightest.seconds += unit.seconds;
    for (const test of unit.tests) lightest.tests.add(test);
  }
  return shards.map((shard) => tests.filter((test) => shard.tests.has(test)));
}
