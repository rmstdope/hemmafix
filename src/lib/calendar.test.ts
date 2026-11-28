import { describe, expect, it } from "vitest";
import {
  agenda,
  CALENDAR_SCOPE,
  hasCalendarScope,
  isFamilyCalendarId,
  withoutCalendarScope,
  type CalendarEvent,
} from "./calendar";
import { addDays } from "./dates";

/** Saturday 28 November 2026, 12:00 in Stockholm. */
const now = new Date("2026-11-28T11:00:00Z");

const timed = (id: string, start: string, end: string, rest: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  location: null,
  start: { dateTime: start },
  end: { dateTime: end },
  ...rest,
});
/** `end` is exclusive, as Google gives it. */
const allDay = (id: string, start: string, end: string, rest: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  location: null,
  start: { date: start },
  end: { date: end },
  ...rest,
});
const cards = (events: CalendarEvent[], at = now) =>
  agenda(events, at).flatMap((d) => d.events.map((e) => ({ day: d.day, ...e })));

describe("day headings", () => {
  const headings = (days: string[], at = now) =>
    agenda(
      days.map((d, i) => allDay(`e${i}`, d, addDays(d, 1))),
      at,
    ).map((d) => d.heading);

  it("names today, tomorrow and then the full date", () => {
    expect(headings(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-11"])).toEqual([
      { lead: "Idag", rest: "lördag 28 november" },
      { lead: "Imorgon", rest: "söndag 29 november" },
      { lead: "Måndag 30 november", rest: null },
      { lead: "Fredag 11 december", rest: null },
    ]);
  });

  it("carries the year when it is not this year, tomorrow too", () => {
    const newYearsEve = new Date("2026-12-31T11:00:00Z");
    expect(headings(["2026-12-31", "2027-01-01", "2027-01-02"], newYearsEve)).toEqual([
      { lead: "Idag", rest: "torsdag 31 december" },
      { lead: "Imorgon", rest: "fredag 1 januari 2027" },
      { lead: "Lördag 2 januari 2027", rest: null },
    ]);
  });
});

describe("the event line", () => {
  it("is the time in Stockholm and the place", () => {
    const [card] = cards([
      timed("Simskola", "2026-11-28T09:00:00Z", "2026-11-28T10:00:00Z", { location: "Valhallabadet" }),
    ]);
    expect(card).toMatchObject({ title: "Simskola", line: "10:00–11:00 · Valhallabadet" });
  });

  it("is just the time without a place", () => {
    expect(cards([timed("Kalas", "2026-11-28T15:00:00+01:00", "2026-11-28T17:30:00+01:00", { location: "  " })])[0]!.line).toBe(
      "15:00–17:30",
    );
  });

  it("reads Heldag for an all-day event, and a place over several lines becomes one", () => {
    expect(cards([allDay("Lov", "2026-11-28", "2026-11-29", { location: "Stugan\nSälen" })])[0]!.line).toBe(
      "Heldag · Stugan Sälen",
    );
  });

  it("names an event without a title (Ingen titel)", () => {
    const untitled = [allDay("a", "2026-11-28", "2026-11-29", { title: null }), allDay("b", "2026-11-29", "2026-11-30", { title: " " })];
    expect(cards(untitled).map((c) => c.title)).toEqual(["(Ingen titel)", "(Ingen titel)"]);
  });
});

describe("events over several days", () => {
  it("shows under every day they cover, counting from the event's own start", () => {
    expect(cards([allDay("Lov", "2026-11-27", "2026-11-30", { location: "Sälen" })]).map((c) => [c.day, c.line])).toEqual([
      ["2026-11-28", "Heldag · dag 2 av 3 · Sälen"],
      ["2026-11-29", "Heldag · dag 3 av 3 · Sälen"],
    ]);
  });

  it("counts a timed event that crosses midnight the same way", () => {
    expect(
      cards([timed("Natt", "2026-11-28T22:00:00+01:00", "2026-11-29T02:00:00+01:00")]).map((c) => [c.day, c.line]),
    ).toEqual([
      ["2026-11-28", "22:00–02:00 · dag 1 av 2"],
      ["2026-11-29", "22:00–02:00 · dag 2 av 2"],
    ]);
  });

  it("does not cover the day it ends at midnight", () => {
    expect(cards([timed("Kväll", "2026-11-28T22:00:00+01:00", "2026-11-29T00:00:00+01:00")]).map((c) => [c.day, c.line])).toEqual([
      ["2026-11-28", "22:00–00:00"],
    ]);
  });

  it("keeps one that starts and ends at the same moment on its day", () => {
    expect(cards([timed("Påminnelse", "2026-11-29T00:00:00+01:00", "2026-11-29T00:00:00+01:00")]).map((c) => c.day)).toEqual([
      "2026-11-29",
    ]);
  });

  it("counts the whole event even where it runs past the last day shown", () => {
    const shown = cards([allDay("Resa", "2026-12-12", "2026-12-15")]);
    expect(shown.map((c) => [c.day, c.line])).toEqual([["2026-12-12", "Heldag · dag 1 av 3"]]);
  });

  it("counts calendar days across the change to summer time", () => {
    const spring = new Date("2027-03-27T11:00:00Z");
    expect(
      cards([timed("Helg", "2027-03-27T23:00:00+01:00", "2027-03-29T00:30:00+02:00")], spring).map((c) => c.line),
    ).toEqual(["23:00–00:30 · dag 1 av 3", "23:00–00:30 · dag 2 av 3", "23:00–00:30 · dag 3 av 3"]);
  });
});

describe("what is listed, and in what order", () => {
  it("covers today and the next 14 days, and leaves empty days out", () => {
    const days = agenda(
      [
        allDay("igår", "2026-11-27", "2026-11-28"),
        allDay("idag", "2026-11-28", "2026-11-29"),
        allDay("sist", "2026-12-12", "2026-12-13"),
        allDay("efter", "2026-12-13", "2026-12-14"),
      ],
      now,
    );
    expect(days.map((d) => [d.day, d.events.map((e) => e.title)])).toEqual([
      ["2026-11-28", ["idag"]],
      ["2026-12-12", ["sist"]],
    ]);
  });

  it("puts all-day events first, then by start, then by title", () => {
    expect(
      cards([
        timed("sen", "2026-11-28T18:00:00+01:00", "2026-11-28T19:00:00+01:00"),
        timed("Öl", "2026-11-28T09:00:00+01:00", "2026-11-28T10:00:00+01:00"),
        // Another offset, an earlier instant.
        timed("tidig", "2026-11-28T07:30:00Z", "2026-11-28T08:00:00Z"),
        timed("Apa", "2026-11-28T09:00:00+01:00", "2026-11-28T10:00:00+01:00"),
        allDay("hela", "2026-11-28", "2026-11-29"),
      ]).map((c) => c.title),
    ).toEqual(["hela", "tidig", "Apa", "Öl", "sen"]);
  });

  it("marks today's events that have ended, never an all-day one", () => {
    expect(
      cards([
        allDay("hela", "2026-11-28", "2026-11-29"),
        timed("slut", "2026-11-28T10:00:00+01:00", "2026-11-28T11:00:00+01:00"),
        timed("pågår", "2026-11-28T11:30:00+01:00", "2026-11-28T13:00:00+01:00"),
        timed("senare", "2026-11-29T10:00:00+01:00", "2026-11-29T11:00:00+01:00"),
      ]).map((c) => [c.title, c.ended]),
    ).toEqual([
      ["hela", false],
      ["slut", true],
      ["pågår", false],
      ["senare", false],
    ]);
  });

  it("leaves out a timed event that ended at midnight today", () => {
    expect(cards([timed("igår", "2026-11-27T22:00:00+01:00", "2026-11-28T00:00:00+01:00")])).toEqual([]);
  });

  it("gives each card of one event its own key per day", () => {
    const ids = cards([allDay("Lov", "2026-11-28", "2026-11-30")]).map((c) => c.id);
    expect(ids).toEqual(["Lov", "Lov"]);
  });
});

describe("the family calendar and the access to it", () => {
  it("knows the family calendar by its id", () => {
    expect(isFamilyCalendarId("family12345@group.calendar.google.com")).toBe(true);
    expect(isFamilyCalendarId("c_abc123@group.calendar.google.com")).toBe(false);
    expect(isFamilyCalendarId("family@gmail.com")).toBe(false);
    expect(isFamilyCalendarId("sv.swedish#holiday@group.v.calendar.google.com")).toBe(false);
  });

  it("reads and removes the calendar scope", () => {
    const stored = `email,openid,${CALENDAR_SCOPE}`;
    expect(hasCalendarScope(stored)).toBe(true);
    expect(hasCalendarScope(`openid ${CALENDAR_SCOPE}`)).toBe(true);
    expect(hasCalendarScope(`${CALENDAR_SCOPE}.events`)).toBe(false);
    expect(hasCalendarScope(null)).toBe(false);
    expect(withoutCalendarScope(stored)).toBe("email,openid");
  });
});
