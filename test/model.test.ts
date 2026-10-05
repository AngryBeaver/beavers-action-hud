import { describe, expect, it } from "vitest";
import {
  arcPath,
  diceFormula,
  fitScene,
  fraction,
  higherSlots,
  placeInBar,
  removeFromBar,
  ringSegments,
  slotGlobes,
  spellSlotBadge,
  toMinimap,
  turnOrder,
} from "../src/core/model.js";

describe("fraction", () => {
  it("is the share of the maximum", () => {
    expect(fraction(15, 30)).toBe(0.5);
    expect(fraction(30, 30)).toBe(1);
  });

  it("stays between empty and full", () => {
    expect(fraction(-5, 30)).toBe(0);
    expect(fraction(40, 30)).toBe(1);
  });

  it("is empty without a usable maximum", () => {
    expect(fraction(5, 0)).toBe(0);
    expect(fraction(5, undefined)).toBe(0);
    expect(fraction("x", 10)).toBe(0);
  });
});

describe("slotGlobes", () => {
  it("keeps only the slots the character has, lowest level first", () => {
    const globes = slotGlobes({
      spell3: { value: 1, max: 2, level: 3 },
      spell1: { value: 4, max: 4, level: 1 },
      spell2: { value: 0, max: 3, level: 2 },
      spell4: { value: 0, max: 0, level: 4 },
    });
    expect(globes.map((g) => g.key)).toEqual(["spell1", "spell2", "spell3"]);
    expect(globes[1]).toEqual({ key: "spell2", level: 2, value: 0, max: 3, pact: false });
  });

  it("puts pact slots last and marks them", () => {
    const globes = slotGlobes({
      pact: { value: 2, max: 2, level: 1 },
      spell2: { value: 1, max: 1, level: 2 },
    });
    expect(globes.map((g) => [g.key, g.pact])).toEqual([
      ["spell2", false],
      ["pact", true],
    ]);
  });

  it("reads the level from the key when the slot has none and caps the value", () => {
    expect(slotGlobes({ spell5: { value: 9, max: 1 } })).toEqual([
      { key: "spell5", level: 5, value: 1, max: 1, pact: false },
    ]);
  });

  it("is empty for a character without spells", () => {
    expect(slotGlobes(undefined)).toEqual([]);
    expect(slotGlobes({})).toEqual([]);
  });
});

describe("fitScene", () => {
  it("puts the corners of the scene on the rim", () => {
    const fit = fitScene({ x: 500, y: 500, width: 3000, height: 4000 }, 200);
    expect(fit.scale).toBeCloseTo(0.04);
    expect(fit.width).toBeCloseTo(120);
    expect(fit.height).toBeCloseTo(160);
    expect(fit.x).toBeCloseTo(40);
    expect(fit.y).toBeCloseTo(20);
  });

  it("is empty for a scene without size", () => {
    expect(fitScene({ x: 0, y: 0, width: 0, height: 0 }, 200).scale).toBe(0);
  });
});

describe("toMinimap", () => {
  const scene = { x: 500, y: 500, width: 3000, height: 4000 };
  const fit = fitScene(scene, 200);

  it("maps the corner of the scene to the corner of its picture", () => {
    const p = toMinimap({ x: 500, y: 500 }, scene, fit);
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(20);
  });

  it("maps the middle of the scene to the middle of the minimap", () => {
    const p = toMinimap({ x: 2000, y: 2500 }, scene, fit);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
  });
});

describe("diceFormula", () => {
  it("rolls one die", () => {
    expect(diceFormula(20)).toBe("1d20");
    expect(diceFormula(100, "normal", 0)).toBe("1d100");
  });

  it("rolls two and keeps one with advantage or disadvantage", () => {
    expect(diceFormula(20, "advantage")).toBe("2d20kh");
    expect(diceFormula(8, "disadvantage")).toBe("2d8kl");
  });

  it("adds a positive or negative bonus", () => {
    expect(diceFormula(20, "advantage", 5)).toBe("2d20kh + 5");
    expect(diceFormula(6, "normal", -2)).toBe("1d6 - 2");
  });

  it("ignores a bonus that is no number", () => {
    expect(diceFormula(6, "normal", NaN)).toBe("1d6");
    expect(diceFormula(6, "normal", 1.9)).toBe("1d6 + 1");
  });
});

describe("placeInBar", () => {
  const a = { type: "item", id: ".Item.a" };
  const b = { type: "item", id: ".Item.b" };
  const c = { type: "skill", id: "ath" };

  it("adds at the end", () => {
    expect(placeInBar([a], b)).toEqual([a, b]);
  });

  it("adds in front of another", () => {
    expect(placeInBar([a, b], c, b)).toEqual([a, c, b]);
  });

  it("moves what is there already instead of adding it twice", () => {
    expect(placeInBar([a, b, c], c, a)).toEqual([c, a, b]);
    expect(placeInBar([a, b, c], a)).toEqual([b, c, a]);
  });

  it("leaves the bar as it is when dropped on itself", () => {
    expect(placeInBar([a, b], a, a)).toEqual([a, b]);
  });

  it("tells same ids of different types apart", () => {
    expect(placeInBar([{ type: "skill", id: "str" }], { type: "save", id: "str" })).toHaveLength(2);
  });
});

describe("removeFromBar", () => {
  it("removes only that one", () => {
    const a = { type: "item", id: ".Item.a" };
    const b = { type: "item", id: ".Item.b" };
    expect(removeFromBar([a, b], { type: "item", id: ".Item.a" })).toEqual([b]);
  });
});

describe("spellSlotBadge", () => {
  const spells = {
    spell1: { value: 1, max: 4, level: 1 },
    spell2: { value: 3, max: 3, level: 2 },
    spell3: { value: 2, max: 2, level: 3 },
    spell4: { value: 0, max: 0, level: 4 },
    pact: { value: 2, max: 2, level: 3 },
  };

  it("shows the slots of the spell's level and the higher ones left", () => {
    expect(spellSlotBadge(spells, 1)).toBe("1/4 +7");
    expect(spellSlotBadge(spells, 2)).toBe("3/3 +4");
  });

  it("counts pact slots of the same level with the regular ones", () => {
    expect(spellSlotBadge(spells, 3)).toBe("4/4");
  });

  it("leaves out the plus when no higher slot is left", () => {
    const used = { spell1: { value: 2, max: 4, level: 1 }, spell2: { value: 0, max: 3, level: 2 } };
    expect(spellSlotBadge(used, 1)).toBe("2/4");
    expect(spellSlotBadge(used, 2)).toBe("0/3");
  });

  it("shows only the higher slots when there is none of the spell's level", () => {
    expect(spellSlotBadge({ pact: { value: 1, max: 2, level: 3 } }, 1)).toBe("+1");
  });

  it("is empty without a slot to cast it with", () => {
    expect(spellSlotBadge(spells, 5)).toBe("");
    expect(spellSlotBadge(undefined, 1)).toBe("");
  });
});

describe("turnOrder", () => {
  it("starts with the current turn and wraps around the round", () => {
    expect(turnOrder(["a", "b", "c", "d"], 2)).toEqual(["c", "d", "a", "b"]);
  });

  it("keeps the order when the first is up, or nobody yet", () => {
    expect(turnOrder(["a", "b"], 0)).toEqual(["a", "b"]);
    expect(turnOrder(["a", "b"], -1)).toEqual(["a", "b"]);
    expect(turnOrder(["a", "b"], 7)).toEqual(["a", "b"]);
  });
});

describe("ringSegments", () => {
  it("cuts the ring into equal parts with gaps", () => {
    expect(ringSegments(4, 10)).toEqual([
      { start: 5, end: 85 },
      { start: 95, end: 175 },
      { start: 185, end: 265 },
      { start: 275, end: 355 },
    ]);
  });

  it("is one nearly full ring for one level, nothing for none", () => {
    expect(ringSegments(1, 6)).toEqual([{ start: 3, end: 357 }]);
    expect(ringSegments(0)).toEqual([]);
  });
});

describe("arcPath", () => {
  it("draws clockwise from the top", () => {
    expect(arcPath(50, 50, 40, 0, 90)).toBe("M 50.00 10.00 A 40 40 0 0 1 90.00 50.00");
  });

  it("takes the long way for more than half the ring", () => {
    expect(arcPath(50, 50, 40, 0, 270)).toBe("M 50.00 10.00 A 40 40 0 1 1 10.00 50.00");
  });
});

describe("higherSlots", () => {
  it("counts what is left above the level", () => {
    const globes = slotGlobes({
      spell1: { value: 1, max: 4, level: 1 },
      spell2: { value: 2, max: 3, level: 2 },
      spell3: { value: 1, max: 2, level: 3 },
    });
    expect(higherSlots(globes, 1)).toBe(3);
    expect(higherSlots(globes, 3)).toBe(0);
  });
});
