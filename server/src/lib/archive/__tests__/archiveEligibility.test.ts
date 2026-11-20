import { describe, expect, it } from "vitest";
import { isRookie, slotEligibility, type PlayerSeasonFacts } from "../archiveEligibility.js";

const vet = (games: Record<string, number>, priorGames: Record<string, number> = {}, primaryPosition = "SS"): PlayerSeasonFacts =>
  ({ games, priorGames, primaryPosition, careerAbBefore: 2000, careerIpBefore: 0 });

describe("slotEligibility", () => {
  it("3 games at a position that season, per position (no summing for MI)", () => {
    expect(slotEligibility("2B", vet({ "2B": 3 })).eligible).toBe(true);
    expect(slotEligibility("2B", vet({ "2B": 2 })).eligible).toBe(false);
    expect(slotEligibility("MI", vet({ SS: 3 })).eligible).toBe(true);
    expect(slotEligibility("MI", vet({ "2B": 2, SS: 1 })).eligible).toBe(false);
  });

  it("20 games the year before", () => {
    expect(slotEligibility("3B", vet({ "1B": 140 }, { "3B": 20 })).eligible).toBe(true);
    expect(slotEligibility("3B", vet({ "1B": 140 }, { "3B": 19 })).eligible).toBe(false);
  });

  it("maps the sheets' old CO slot to corner (1B/3B) and any outfield spot to OF", () => {
    expect(slotEligibility("CO", vet({ "1B": 50 })).eligible).toBe(true);
    expect(slotEligibility("CM", vet({ SS: 50 })).eligible).toBe(false);
    expect(slotEligibility("OF", vet({ CF: 10 })).eligible).toBe(true);
  });

  it("DH needs 10 games at DH (or 20 the year before), not just any hitter", () => {
    expect(slotEligibility("DH", vet({ DH: 10 })).eligible).toBe(true);
    expect(slotEligibility("DH", vet({ DH: 9, "1B": 150 })).eligible).toBe(false);
    expect(slotEligibility("DH", vet({}, { DH: 20 })).eligible).toBe(true);
  });

  it("a P slot needs pitching games; a hitter there is flagged", () => {
    expect(slotEligibility("P", vet({ P: 30 }, {}, "P")).eligible).toBe(true);
    expect(slotEligibility("P", vet({ SS: 150 })).eligible).toBe(false);
  });

  it("R is the rookie spot: any rookie, pitcher or hitter; a veteran is flagged", () => {
    const rookieP: PlayerSeasonFacts = { games: { P: 12 }, priorGames: {}, primaryPosition: "P", careerAbBefore: 0, careerIpBefore: 31 };
    const prospect: PlayerSeasonFacts = { games: {}, priorGames: {}, primaryPosition: "SS", careerAbBefore: 0, careerIpBefore: 0 };
    expect(slotEligibility("R", rookieP).eligible).toBe(true);
    expect(slotEligibility("R", prospect).eligible).toBe(true);
    expect(slotEligibility("R", vet({ OF: 150 })).eligible).toBe(false);
    expect(isRookie({ ...prospect, careerAbBefore: 130 })).toBe(false);
    expect(isRookie({ ...prospect, careerIpBefore: 50 })).toBe(false);
  });

  it("a rookie with no games yet qualifies at his primary position only", () => {
    const rookie: PlayerSeasonFacts = { games: {}, priorGames: {}, primaryPosition: "SS", careerAbBefore: 40, careerIpBefore: 0 };
    expect(slotEligibility("SS", rookie).eligible).toBe(true);
    expect(slotEligibility("MI", rookie).eligible).toBe(true);
    expect(slotEligibility("C", rookie).eligible).toBe(false);
  });

  it("a kept player keeps last season's slot (grandfathering); only that slot", () => {
    const tatis = { ...vet({ RF: 137, CF: 5 }), keptFromSlot: "SS" };
    expect(slotEligibility("SS", tatis)).toMatchObject({ eligible: true, reason: "kept in last season's SS slot" });
    expect(slotEligibility("C", tatis).eligible).toBe(false);
    expect(slotEligibility("CM", { ...vet({ SS: 100 }), keptFromSlot: "CO" }).eligible).toBe(true); // CO is today's CM
    // Never across roles: a pitcher "kept" in a C slot is a wrong match, not grandfathering.
    expect(slotEligibility("C", { ...vet({ P: 18 }, {}, "P"), keptFromSlot: "C" }).eligible).toBe(false);
  });

  it("a pitcher hurt all season still fits a P slot; a hitter doesn't", () => {
    expect(slotEligibility("P", vet({}, {}, "P")).eligible).toBe(true);
    expect(slotEligibility("P", vet({}, {}, "SS")).eligible).toBe(false);
  });

  it("IL/DL slots take anyone", () => {
    expect(slotEligibility("IL1", vet({})).eligible).toBe(true);
    expect(slotEligibility("DL", vet({})).eligible).toBe(true);
  });
});
