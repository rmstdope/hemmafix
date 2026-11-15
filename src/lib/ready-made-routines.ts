/**
 * The routines every home starts with, as its own copies (given once; see
 * `ensureReadyMadeRoutines` in src/server/routines.ts). Tasks are in the order they show.
 */
export const READY_MADE_ROUTINES: readonly { name: string; tasks: readonly string[] }[] = [
  {
    name: "Städa badrum",
    tasks: ["Dammsuga golvet", "Moppa golvet", "Putsa spegeln", "Städa toaletten", "Rengöra handfatet"],
  },
  {
    name: "Städa kök",
    tasks: ["Diska", "Torka köksbänken", "Torka av spisen", "Ta ut soporna", "Dammsuga golvet", "Moppa golvet"],
  },
  { name: "Städa sovrum", tasks: ["Byta lakan", "Damma", "Dammsuga golvet", "Vädra"] },
];

/** A routine holds at most this many tasks. */
export const MAX_ROUTINE_TASKS = 30;
