import { describe, expect, it } from "vitest";
import { formatCoins } from "./coins";
import { debtCardText, debtCardTitle, undoDebtText, undoDebtTitle } from "./debt";

describe("debt texts", () => {
  it("writes a balance below zero with a true minus", () => {
    expect(formatCoins(-150)).toBe("−150");
    expect(formatCoins(-1200)).toBe("−1 200");
  });

  it("asks a person about their own tick", () => {
    const own = { own: true, name: "Erik", balance: -150 };
    expect(undoDebtTitle(own)).toBe("Mynten är redan använda");
    expect(undoDebtText(own)).toBe(
      "Ångra ändå? Du får −150 mynt och kan inte köpa något förrän du har tjänat ihop dem igen.",
    );
  });

  it("asks an adult about someone else's tick, by first name", () => {
    const other = { own: false, name: "Erik", balance: -120 };
    expect(undoDebtTitle(other)).toBe("Erik har redan använt mynten");
    expect(undoDebtText(other)).toBe(
      "Ångra ändå? Erik får −120 mynt och kan inte köpa något förrän Erik har tjänat ihop dem igen.",
    );
  });

  it("explains the debt in Butik with how far below zero it is", () => {
    expect(debtCardTitle(-150)).toBe("Du har −150 mynt");
    expect(debtCardText(-150)).toBe("Tjäna 150 mynt till innan du kan köpa något.");
  });
});
