import { describe, expect, it } from "vitest";
import { joinNames, noteText } from "./high-fives";

describe("joinNames", () => {
  it("reads one, two and three names the Swedish way", () => {
    expect(joinNames(["Mamma"])).toBe("Mamma");
    expect(joinNames(["Mamma", "Pappa"])).toBe("Mamma och Pappa");
    expect(joinNames(["Mamma", "Pappa", "Lisa"])).toBe("Mamma, Pappa och Lisa");
  });
});

describe("noteText", () => {
  it("names who gave a high five for which task", () => {
    expect(noteText(["Mamma"], "Tömma diskmaskinen")).toBe("Mamma gav dig en high five för Tömma diskmaskinen");
    expect(noteText(["Mamma", "Pappa"], "Tömma diskmaskinen")).toBe(
      "Mamma och Pappa gav dig en high five för Tömma diskmaskinen",
    );
  });
});
