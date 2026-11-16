/** "Inga uppgifter", "1 uppgift", "5 uppgifter": how many tasks a routine holds. */
export function taskCountLabel(count: number): string {
  if (count === 0) return "Inga uppgifter";
  return count === 1 ? "1 uppgift" : `${count} uppgifter`;
}

/** The notice for any save that failed in a way the person cannot fix. */
export const SAVE_FAILED = "Det gick inte att spara. Försök igen.";

/** The add button of the "En rutin" form: counts the tasks, plain when there is nothing to add. */
export function addRoutineButtonLabel(count: number): string {
  if (count === 0) return "Lägg till";
  return count === 1 ? "Lägg till 1 uppgift" : `Lägg till ${count} uppgifter`;
}

/** The notice after a routine's tasks were added to the home. */
export function routineAddedNotice(count: number): string {
  return count === 1 ? "1 uppgift är tillagd" : `${count} uppgifter är tillagda`;
}

/** The routine was removed (or never was this home's) before it could be added. */
export const ROUTINE_GONE = "Rutinen finns inte längre";

/** The line of the remove-routine confirmation: counts the tasks that go with it, none when there are none. */
export function removeRoutineNotice(count: number): string {
  const tail = " Uppgifter som redan finns i hemmet påverkas inte.";
  if (count === 0) return `Rutinen tas bort.${tail}`;
  return count === 1 ? `Rutinen och dess 1 uppgift tas bort.${tail}` : `Rutinen och dess ${count} uppgifter tas bort.${tail}`;
}
