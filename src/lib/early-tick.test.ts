import { describe, expect, it } from "vitest";
import { earlyDetail, earlyDay, earlyDoneMessage, isNotYetDue, lockedDetail, lockedLabel, lockedMessage } from "./early-tick";

const daily = { unit: "day", interval: 1 } as const;
const today = "2026-11-24";

describe("isNotYetDue", () => {
  it("is true for a repeating chore with a day ahead", () => {
    expect(isNotYetDue({ dueDate: "2026-11-25", recurrence: daily }, today)).toBe(true);
  });
  it("is false today, overdue, undated and for a one-off", () => {
    expect(isNotYetDue({ dueDate: today, recurrence: daily }, today)).toBe(false);
    expect(isNotYetDue({ dueDate: "2026-11-20", recurrence: daily }, today)).toBe(false);
    expect(isNotYetDue({ dueDate: null, recurrence: daily }, today)).toBe(false);
    expect(isNotYetDue({ dueDate: "2026-11-30", recurrence: null }, today)).toBe(false);
  });
});

describe("the words", () => {
  it("says imorgon for tomorrow and names the day further ahead", () => {
    expect(earlyDay("2026-11-25", today)).toBe("imorgon");
    expect(earlyDay("2026-11-26", today)).toBe("tor 26 nov");
  });
  it("words the child's lock", () => {
    expect(lockedDetail("2026-11-25", today)).toBe("Kan bockas av imorgon");
    expect(lockedDetail("2026-11-26", today)).toBe("Kan bockas av tor 26 nov");
    expect(lockedMessage("Diska", "2026-11-26", today)).toBe("Diska kan bockas av tor 26 nov.");
    expect(lockedLabel("Diska", "2026-11-25", today)).toBe("Diska: kan bockas av imorgon");
  });
  it("words the adult's row and answer", () => {
    expect(earlyDetail("2026-11-25", today)).toBe("Inga mynt förrän imorgon");
    expect(earlyDoneMessage("Diska", "2026-11-25", today)).toBe(
      "Diska är klar. Inga mynt, eftersom den inte är dags förrän imorgon.",
    );
    expect(earlyDoneMessage("Diska", "2026-11-26", today)).toBe(
      "Diska är klar. Inga mynt, eftersom den inte är dags förrän tor 26 nov.",
    );
  });
});
