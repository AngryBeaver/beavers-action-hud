// What the HUD shows of a dnd5e character: read here, drawn in hud.ts.

import { esc, MODULE_ID, placeInBar, slotGlobes, spellSlotBadge, type BarRef } from "./core/model.js";
import { notesOf, openNotes } from "./notes.js";

/** A small fact on a drawer row or beside a group's label: an icon, with a text or alone. */
export interface Tag {
  icon: string;
  /** A picture after the text, drawn in the color of the icon: dnd5e's sign of a kind of damage. */
  img?: string;
  text?: string;
  tooltip?: string;
}

/** What using an entry costs in a turn, if not an action: its border has another colour. */
export type Kind = "bonus" | "reaction";

/** One button or drawer row. */
export interface Entry {
  name: string;
  img: string;
  kind?: Kind;
  /** Facts below the name of a drawer row. A row with tags, also none, is a high one. */
  tags?: Tag[];
  /** Takes what the entry stands for off the character: its row has an x for that. */
  remove?: () => unknown;
  /** A switch at the end of its row, grey while off: the shield of what can be equipped. */
  toggle?: { icon: string; on: boolean; tooltip: string; run: () => unknown };
  /** What kind of thing it is, at the end of its description's head: the school of a spell. */
  mark?: { img: string; label: string };
  /** Small text on the icon: remaining uses or the quantity. */
  badge?: string;
  /** Drawn faded: a switched off effect. */
  dimmed?: boolean;
  use: (event: Event) => unknown;
  /** Right click: the sheet behind the entry. */
  sheet?: () => unknown;
  /** What to store to have this entry in the bar. Entries without cannot go there. */
  ref?: BarRef;
  /** Its description as HTML, shown after hovering a while. */
  describe?: () => Promise<string>;
}

export interface Group {
  label: string;
  /** Beside the label, e.g. the slots left for a spell level. */
  note?: string;
  tags?: Tag[];
  /** Belongs to the group before it, apart from its entries: a smaller label. */
  sub?: boolean;
  /** A button beside the label, handled by the HUD as that data-action. */
  button?: { action: string; icon: string; label: string; active?: boolean };
  entries: Entry[];
}

export interface SheetTab {
  tab: string;
  label: string;
  icon?: string;
  svg?: string;
}

const loc = (key: string) => game.i18n.localize(key);
const bySort = (a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0);
const byName = (a: any, b: any) => String(a.name).localeCompare(String(b.name), game.i18n.lang);

const ACTOR_FLAG = "actor";

const PLAYABLE = ["character", "npc"];

/**
 * Who the user can play: the characters and NPCs they own, and what they own of the tokens on the viewed scene.
 * A summon is such a token: its actor exists only on that token, the user owns it but not the actor it was made of.
 * A GM owns everything, so for them it is the characters only.
 */
export function availableActors(): any[] {
  const types = game.user.isGM ? ["character"] : PLAYABLE;
  const actors = new Map<string, any>();
  const add = (actor: any) => actor && PLAYABLE.includes(actor.type) && actors.set(actor.uuid, actor);
  add(game.user.character);
  // The tokens first: an actor that stands on the scene as its own token is offered as that token, not twice
  const onScene = new Set<string>();
  if (canvas?.ready && !game.user.isGM) {
    for (const token of canvas.tokens.placeables) {
      if (!token.actor?.isOwner) continue;
      add(token.actor);
      onScene.add(token.actor.id);
    }
  }
  for (const actor of game.actors) {
    if (actor.isOwner && types.includes(actor.type) && !onScene.has(actor.id)) add(actor);
  }
  return [...actors.values()];
}

/** The actor the user picked in the HUD. Stored by uuid: the actor of a summon's token has no id of its own. */
function pickedActor(): any {
  const stored = game.user.getFlag(MODULE_ID, ACTOR_FLAG);
  if (typeof stored !== "string" || !stored) return undefined;
  try {
    const actor = stored.includes(".") ? fromUuidSync(stored) : game.actors.get(stored);
    return actor?.isOwner ? actor : undefined;
  } catch {
    return undefined; // a summon that is gone, or on a scene not loaded
  }
}

/**
 * The character the HUD is for: the one the user picked in the HUD, else the user's own character, else the owned
 * token they control, else the first character they own.
 */
export function hudActor(): any {
  const picked = pickedActor();
  if (picked) return picked;
  if (game.user.character) return game.user.character;
  const controlled = canvas?.ready ? canvas.tokens.controlled.find((t: any) => t.actor?.isOwner) : undefined;
  if (controlled) return controlled.actor;
  if (game.user.isGM) return undefined;
  return game.actors.find((a: any) => a.type === "character" && a.isOwner);
}

/** Play another character: the HUD shows it, and its token is the controlled one. */
export async function pickActor(actor: any) {
  await game.user.setFlag(MODULE_ID, ACTOR_FLAG, actor.uuid);
  const token = canvas?.ready ? actor.getActiveTokens()[0] : undefined;
  token?.control({ releaseOthers: true });
}

/** dnd5e's compendium content carries notes on how Foundry automates it, as secrets: nothing a player needs. */
function withoutFoundryNotes(html: string): string {
  if (!/foundry\s*note/i.test(html)) return html;
  const box = document.createElement("template");
  box.innerHTML = html;
  box.content.querySelectorAll("section.secret, .foundry-note").forEach((section) => {
    if (/^\s*foundry\s*note/i.test(section.textContent ?? "")) section.remove();
  });
  return box.innerHTML;
}

/** The rich text of a document as HTML, with links and inline rolls like on its sheet. */
const enrich = (text: unknown, doc: any) => async (): Promise<string> => {
  if (!text) return "";
  const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(String(text), {
    relativeTo: doc,
    rollData: doc.getRollData?.() ?? {},
    secrets: doc.isOwner,
  });
  return withoutFoundryNotes(html);
};

const KINDS: Kind[] = ["bonus", "reaction"];

/** Bonus action or reaction: the casting time of a spell, else how the activity (the item's first) is activated. */
function kindOf(item: any, activity?: any): Kind | undefined {
  const first = activity ?? [...(item.system.activities ?? [])][0];
  const type =
    (item.type === "spell" && !activity ? item.system.activation?.type : undefined) ?? first?.activation?.type;
  return KINDS.find((k) => k === type);
}

interface Dice {
  formula: string;
  /** With the kind of damage: "2d6 Fire". */
  label: string;
  /** dnd5e's sign of that kind of damage, if it is of one kind. */
  img?: string;
}

/** dnd5e's sign of a kind of damage or healing, as its sheets show it: "fire". */
const typeSign = (type: unknown): string | undefined =>
  typeof type === "string"
    ? (CONFIG.DND5E.damageTypes?.[type]?.icon ?? CONFIG.DND5E.healingTypes?.[type]?.icon ?? undefined)
    : undefined;

/** A formula with the numbers of who rolls it instead of "@mod". */
function resolved(formula: string, activity: any): string {
  try {
    return new Roll(formula, activity.getRollData?.() ?? {}).formula;
  } catch {
    return formula;
  }
}

/** How many targets an activity has when cast `increase` levels higher: the rays of Scorching Ray, the missiles. */
function targetCount(activity: any, spell: any, increase: number): number {
  const base = Number(activity.target?.affects?.count) || 0;
  const formula = activity._source?.target?.affects?.count;
  if (!increase || !formula || !/@/.test(String(formula))) return base;
  try {
    const data = { ...(activity.getRollData?.() ?? {}) };
    data.item = { ...data.item, level: spell.system.level + increase };
    data.scaling = { increase, value: increase + 1 };
    return Number(Roll.safeEval(Roll.replaceFormulaData(String(formula), data))) || base;
  } catch {
    return base;
  }
}

/**
 * The dice a spell harms (or heals) with, cast `increase` levels above its own. What hits several times says so:
 * "3× 2d6".
 */
function spellDice(spell: any, heal: boolean, increase = 0): Dice | undefined {
  const activity = [...(spell.system.activities ?? [])].find(
    (a: any) => (a.type === "heal") === heal && a.labels?.damage?.length,
  );
  const base = activity?.labels.damage[0];
  if (!base?.formula) return undefined;
  let formula: string = base.formula;
  const part = heal ? activity.healing : activity.damage?.parts?.[0];
  if (increase && part?.scaledFormula) {
    try {
      formula = resolved(part.scaledFormula(increase), activity) || formula;
    } catch {
      /* the dice of its own level then */
    }
  }
  const count = heal ? 0 : targetCount(activity, spell, increase);
  const text = count > 1 ? `${count}× ${formula}` : formula;
  // What heals hit points says no kind: only what heals something else does, temporary hit points
  if (heal && (!base.damageType || base.damageType === "healing")) return { formula: text, label: text };
  return {
    formula: text,
    label: String(base.label ?? "").replace(base.formula, text) || text,
    img: typeSign(base.damageType),
  };
}

/** The creatures spells summon, by uuid. Null: not read yet, or gone. */
const summoned = new Map<string, any>();
let summonListener: (() => void) | undefined;

/** Called when what a summoning spell harms with is known: it is read from the creature, which takes a moment. */
export function onSummonDice(listener: () => void) {
  summonListener = listener;
}

/**
 * The dice of a creature's first attack when `summon` calls it, `increase` levels above the spell's own. Its
 * formula may count on the slot and the caster: "(@flags.dnd5e.summon.level - 1)d8 + @flags.dnd5e.summon.mod".
 */
function creatureDice(creature: any, spell: any, summon: any, increase: number): Dice | undefined {
  for (const item of creature?.items ?? []) {
    const attack = [...(item.system.activities ?? [])].find((a: any) => a.labels?.damage?.length);
    const shown = attack?.labels.damage[0];
    if (!shown?.formula) continue;
    let formula: string = shown.formula;
    const raw = attack.damage?.parts?.[0]?.formula;
    if (typeof raw === "string" && raw.includes("@flags.dnd5e.summon")) {
      try {
        const data = { ...(attack.getRollData?.() ?? {}) };
        const level = (Number(spell.system.level) || 0) + increase;
        const mod = Number(summon.getRollData?.()?.mod) || 0;
        data.flags = { ...data.flags, dnd5e: { ...data.flags?.dnd5e, summon: { level, mod } } };
        // "(3 - 1)d8" is 2d8
        const counted = Roll.replaceFormulaData(raw, data, { missing: "0" }).replace(
          /\(([\d\s+*/-]+)\)d/g,
          (_: string, n: string) => `${Roll.safeEval(n)}d`,
        );
        formula = (globalThis as any).dnd5e?.dice?.simplifyRollFormula?.(counted) || counted;
      } catch {
        /* as its sheet shows it then */
      }
    }
    return {
      formula,
      label: `${creature.name}: ${String(shown.label ?? "").replace(shown.formula, formula) || formula}`,
      img: typeSign(shown.damageType),
    };
  }
  return undefined;
}

/**
 * A spell like Spiritual Weapon harms with what it summons, not itself: the dice of that creature's first attack.
 * The creature is the world's copy of it if there is one (a summon was made of it), else it is read from its
 * compendium: undefined until then.
 */
function summonedDice(spell: any, increase = 0): Dice | undefined {
  const summon = [...(spell.system.activities ?? [])].find((a: any) => a.type === "summon");
  const uuid: unknown = summon?.profiles?.[0]?.uuid;
  if (typeof uuid !== "string" || !uuid) return undefined;
  if (!summoned.has(uuid)) {
    const local = game.actors.get(uuid.split(".").pop());
    summoned.set(uuid, local ?? null);
    if (!local) {
      void Promise.resolve(fromUuid(uuid))
        .then((creature: any) => {
          if (!creature) return;
          summoned.set(uuid, creature);
          summonListener?.();
        })
        .catch((e: unknown) => console.warn(`${MODULE_ID} | ${uuid} not read`, e));
    }
  }
  return creatureDice(summoned.get(uuid), spell, summon, increase);
}

/**
 * What a spell does at a glance: concentration, ritual, its range, the dice it heals or harms with, costly materials.
 * With `increase` the dice are the ones of a slot that many levels higher.
 */
function spellTags(spell: any, increase = 0): Tag[] {
  const tags: Tag[] = [];
  const labels = spell.labels ?? {};
  if (spell.system.properties?.has("concentration")) {
    tags.push({ icon: "fa-solid fa-head-side-brain", tooltip: loc("DND5E.Concentration") });
  }
  if (spell.system.properties?.has("ritual")) {
    tags.push({ icon: "fa-solid fa-book-open", tooltip: loc("DND5E.ITEM.Property.Ritual") });
  }
  if (labels.range)
    tags.push({ icon: "fa-solid fa-ruler-horizontal", text: labels.range, tooltip: loc("DND5E.Range") });
  const damage = spellDice(spell, false, increase) ?? summonedDice(spell, increase);
  if (damage)
    tags.push({ icon: "fa-solid fa-burst bah-harm", img: damage.img, text: damage.formula, tooltip: damage.label });
  const healing = spellDice(spell, true, increase);
  if (healing)
    tags.push({ icon: "fa-solid fa-heart bah-heal", img: healing.img, text: healing.formula, tooltip: healing.label });
  if (costly(spell)) {
    tags.push({ icon: "fa-solid fa-coins bah-cost", tooltip: labels.materials || loc("DND5E.Materials") });
  }
  return tags;
}

/** Whether a higher slot changes the dice of a spell, how often it hits, or the dice of what it summons. */
function gainsFrom(spell: any, increase: number): boolean {
  return (
    [false, true].some((heal) => spellDice(spell, heal, increase)?.formula !== spellDice(spell, heal)?.formula) ||
    summonedDice(spell, increase)?.formula !== summonedDice(spell)?.formula
  );
}

const COSTLY = /\d\+?\s*[cseg]p\b/i;

/** Whether a spell needs materials that cost. Not every spell has the price as a number, but the text names it. */
const costly = (spell: any) => Number(spell.system.materials?.cost) > 0 || COSTLY.test(spell.labels?.materials ?? "");

/** A picture drawn in one color, the one of `look`: dnd5e's sign of a kind of damage, "bah-harm". */
export const signHtml = (img: string, look = "") =>
  `<i class="bah-sign ${esc(look)}" style="-webkit-mask-image: url('${esc(img)}'); mask-image: url('${esc(img)}')" inert></i>`;

/** The color an icon has: "bah-harm" of "fa-solid fa-burst bah-harm". */
export const lookOf = (icon: string) => icon.replace(/\bfa-\S+/g, "").trim();

/** Text that is HTML already. */
interface Html {
  html: string;
}

/** Dice as they are said, "3d6 Psychic", with the sign of that kind of damage between the dice and its name. */
function diceHtml(dice: { formula: string; label?: string; img?: string } | undefined, look: string): Html | undefined {
  if (!dice?.formula) return undefined;
  const label = dice.label || dice.formula;
  const end = label.indexOf(dice.formula) + dice.formula.length;
  if (!dice.img || end < dice.formula.length) return { html: esc(label) };
  return { html: `${esc(label.slice(0, end))} ${signHtml(dice.img, look)}${esc(label.slice(end))}` };
}

/** Rows of a label and its value, some with an icon before the value: "fa-burst bah-harm" in the color of harm. */
const factList = (facts: [string, unknown, string?][]): string => {
  const rows = facts
    .filter(([, value]) => value)
    .map(([key, value, icon]) => {
      const text = typeof (value as Html).html === "string" ? (value as Html).html : esc(value);
      return `<dt>${esc(loc(key))}</dt><dd>${icon ? `<i class="fa-solid ${icon}" inert></i>` : ""}${text}</dd>`;
    });
  return rows.length ? `<dl class="bah-facts">${rows.join("")}</dl>` : "";
};

/** The first attack of what attacks, a weapon or a claw. */
const attackOf = (item: any) => item.system.activities?.getByType?.("attack")?.[0];

/**
 * How far an attack goes. The item knows both ranges of what shoots, "30/120 ft": the attack only the far one. What
 * only reaches the next square, 5 ft, has no range worth telling.
 */
function attackRange(item: any, attack: any): string | undefined {
  if (item.labels?.range) return item.labels.range;
  const range = attack.range ?? {};
  if (range.units === "ft" && Number(range.value) <= 5) return undefined;
  return attack.labels?.range || undefined;
}

/**
 * Above the description of what attacks: what it adds to the attack roll, its damage and its range. Of `attack`,
 * else of the first attack the item has. Empty for what does not attack.
 */
function attackFacts(item: any, attack?: any): string {
  attack ??= attackOf(item);
  if (attack?.type !== "attack") return "";
  const labels = attack.labels ?? {};
  // Each part of the damage with the sign of its own kind
  const damage: string[] = (labels.damage ?? [])
    .map((d: any) => diceHtml({ formula: d.formula, label: d.label, img: typeSign(d.damageType) }, "bah-harm")?.html)
    .filter(Boolean);
  return factList([
    ["DND5E.ToHit", labels.toHit],
    ["DND5E.Range", attackRange(item, attack), "fa-ruler-horizontal"],
    ["DND5E.Damage", damage.length ? { html: damage.join(", ") } : undefined, "fa-burst bah-harm"],
  ]);
}

/** Above a spell's description: how it is cast and what it does. */
function spellFacts(spell: any): string {
  const labels = spell.labels ?? {};
  const components = [labels.components?.vsm, labels.materials ? `(${labels.materials})` : ""]
    .filter(Boolean)
    .join(" ");
  const harm = spellDice(spell, false) ?? summonedDice(spell);
  const healing = spellDice(spell, true);
  return factList([
    ["DND5E.SpellCastTime", labels.activation],
    ["DND5E.Target", labels.target],
    ["DND5E.Components", components, costly(spell) ? "fa-coins bah-cost" : undefined],
    ["DND5E.Duration", labels.concentrationDuration ?? labels.duration],
    ["DND5E.Range", labels.range, "fa-ruler-horizontal"],
    ["DND5E.Damage", diceHtml(harm, "bah-harm"), "fa-burst bah-harm"],
    ["BEAVERS_ACTION_HUD.facts.healing", diceHtml(healing, "bah-heal"), "fa-heart bah-heal"],
  ]);
}

/** The shield of the dnd5e sheet: lit on what is equipped, a click puts it on or away. Not on what cannot be. */
function equipToggle(item: any): Entry["toggle"] {
  if (typeof item.system.equipped !== "boolean") return undefined;
  const on = item.system.equipped;
  return {
    icon: "fa-solid fa-shield-halved",
    on,
    tooltip: loc(on ? "DND5E.Equipped" : "DND5E.Unequipped"),
    run: () => item.update({ "system.equipped": !on }),
  };
}

/**
 * What a carried thing is at a glance: the weight of all of it first, attuned, the range and dice of a weapon.
 */
function gearTags(item: any): Tag[] {
  const tags: Tag[] = [];
  const system = item.system;
  // Of a container it is not known at once: it has to ask for what is in it
  const weight = system.totalWeight;
  if (typeof weight === "number" && weight >= 0.05) {
    const units = CONFIG.DND5E.weightUnits?.[system.weight?.units];
    tags.push({
      icon: "fa-solid fa-weight-hanging",
      text: `${Math.round(weight * 10) / 10} ${units?.abbreviation ?? system.weight?.units ?? ""}`.trim(),
      tooltip: loc("DND5E.Weight"),
    });
  }
  if (system.attuned) tags.push({ icon: "fa-solid fa-sun", tooltip: loc("DND5E.Attuned") });
  const attack = attackOf(item);
  if (attack) {
    const range = attackRange(item, attack);
    if (range) tags.push({ icon: "fa-solid fa-ruler-horizontal", text: range, tooltip: loc("DND5E.Range") });
    const damage = attack.labels?.damage?.[0];
    if (damage?.formula) {
      tags.push({
        icon: "fa-solid fa-burst bah-harm",
        img: typeSign(damage.damageType),
        text: damage.formula,
        tooltip: damage.label ?? damage.formula,
      });
    }
  }
  return tags;
}

/**
 * The ammunition a weapon shoots: what its last attack used, else the first the character carries that fits, like
 * the attack dialog of dnd5e picks it. Undefined when the character has none.
 */
function ammunitionOf(weapon: any): any {
  const options: any[] = weapon.system.ammunitionOptions ?? [];
  const last = Object.values<any>(weapon.getFlag("dnd5e", "last") ?? {}).map((l) => l?.ammunition);
  return (options.find((o) => last.includes(o.value)) ?? options[0])?.item;
}

const QUIVER = 20;

/**
 * A spell with uses of its own that is cast with a slot too: Divine Smite of the 2024 paladin, cast once a day for
 * free and with slots as often as there are. One of its activities takes a slot and not one of those uses.
 */
const alsoSlotted = (spell: any) =>
  spell.type === "spell" &&
  !!spell.system.uses?.max &&
  !spell.system.linkedActivity &&
  spell.system.level > 0 &&
  spell.system.canScale !== false &&
  [...(spell.system.activities ?? [])].some(
    (a: any) => a.consumption?.spellSlot && !a.consumption.targets?.some((t: any) => t.type === "itemUses"),
  );

/** The free casts such a spell has left, "1 free". None left is no badge: "0/1" would read as not castable. */
function freeBadge(spell: any): string | undefined {
  const free = Number(spell.system.uses?.value) || 0;
  return free > 0 ? game.i18n.format("BEAVERS_ACTION_HUD.drawer.free", { count: free }) : undefined;
}

function badgeOf(item: any): string | undefined {
  const properties = item.type === "weapon" ? item.system.properties : undefined;
  // A weapon that needs ammunition is as good as the ammunition left for it: of a full quiver of 20, more is not shown
  if (properties?.has("amm")) {
    return `${Math.min(QUIVER, Math.max(0, Number(ammunitionOf(item)?.system.quantity) || 0))}/${QUIVER}`;
  }
  const own = item.system.uses;
  // With the free casts used up the slots are what is left to cast it with
  if (alsoSlotted(item))
    return freeBadge(item) ?? (spellSlotBadge(item.actor?.system.spells, item.system.level) || undefined);
  if (own?.max) return `${own.value}/${own.max}`;
  // A spell another item grants (a wand, a staff, a feature) is cast with what that item's cast activity uses up:
  // the uses of the activity or of the item. Only if the activity says so it takes a spell slot.
  const cast = item.type === "spell" ? item.system.linkedActivity : undefined;
  if (cast) {
    const uses = [cast.uses, cast.item?.system.uses].find((u) => u?.max);
    if (uses) return `${uses.value}/${uses.max}`;
    if (!cast.consumption?.spellSlot) return undefined;
  }
  // A spell cast with slots: the slots of its level, and the higher ones left to cast it with
  if (item.type === "spell" && item.system.level > 0 && item.system.canScale !== false && item.actor) {
    return spellSlotBadge(item.actor.system.spells, item.system.level) || undefined;
  }
  const quantity = item.system.quantity;
  // Of weapons only the thrown ones count: every throw is one less in hand
  if (properties) return properties.has("thr") ? `×${quantity ?? 0}` : undefined;
  return quantity > 1 ? `×${quantity}` : undefined;
}

const openSheet = (doc: any) => () => doc.sheet?.render({ force: true });

function itemEntry(item: any): Entry {
  const description = enrich(item.system.description?.value, item);
  const spell = item.type === "spell";
  const school = spell ? CONFIG.DND5E.spellSchools?.[item.system.school] : undefined;
  return {
    name: item.name,
    img: item.img,
    badge: badgeOf(item),
    kind: kindOf(item),
    tags: spell ? spellTags(item) : undefined,
    mark: school?.icon ? { img: school.icon, label: loc(school.label) } : undefined,
    use: (event) => item.use({ event }),
    sheet: openSheet(item),
    ref: { type: "item", id: `.Item.${item.id}` },
    describe: async () => (spell ? spellFacts(item) : attackFacts(item)) + (await description()),
  };
}

/** An effect that is not in force: switched off, run out, or of an item that is not worn or attuned. */
const inactive = (effect: any) => !!(effect.disabled || effect.duration?.expired || effect.isSuppressed);

/** As a button of the bar or a row of the drawer: a click switches the effect on or off. */
function effectEntry(effect: any): Entry {
  return {
    name: effect.name,
    img: effect.img,
    dimmed: inactive(effect),
    use: () => effect.update({ disabled: !effect.disabled }),
    sheet: openSheet(effect),
    ref: { type: "effect", id: effect.uuid },
    describe: enrich(effect.description, effect),
  };
}

/**
 * Everything the character can attack with, except spells: equipped weapons, natural attacks, attacking features.
 * Only a character equips: what an NPC has, it uses.
 */
export function attacks(actor: any): any[] {
  const ready = (i: any) => actor.type !== "character" || i.system.equipped !== false;
  return actor.items
    .filter((i: any) => i.type !== "spell" && i.system.activities?.getByType?.("attack")?.length && ready(i))
    .sort(bySort);
}

const signed = (n: unknown): string | undefined => {
  const v = Number(n);
  return Number.isFinite(v) ? (v >= 0 ? `+${v}` : `${v}`) : undefined;
};

/** A roll of the character itself: an ability check, a saving throw, a skill or a tool. */
function checkEntry(actor: any, type: string, id: string): Entry | undefined {
  const ref = { type, id };
  if (type === "ability" || type === "save") {
    const ability = actor.system.abilities?.[id];
    if (!ability) return undefined;
    const config = CONFIG.DND5E.abilities[id] ?? {};
    const label = config.label ?? id;
    const save = type === "save";
    return {
      ref,
      name: save ? `${label} (${loc("BEAVERS_ACTION_HUD.checks.save")})` : label,
      img: config.icon ?? "icons/svg/d20-grey.svg",
      badge: signed(save ? (ability.save?.value ?? ability.save) : ability.mod),
      use: (event) =>
        save ? actor.rollSavingThrow({ ability: id, event }) : actor.rollAbilityCheck({ ability: id, event }),
    };
  }
  const data = actor.system[`${type}s`]?.[id];
  if (!data) return undefined;
  const config = type === "skill" ? CONFIG.DND5E.skills[id] : undefined;
  return {
    ref,
    name: config?.label ?? game.dnd5e?.documents?.Trait?.keyLabel?.(id, { trait: "tool" }) ?? id,
    img: config?.icon ?? "icons/svg/d20-grey.svg",
    badge: signed(data.total),
    use: (event) =>
      type === "skill" ? actor.rollSkill({ skill: id, event }) : actor.rollToolCheck({ tool: id, event }),
  };
}

const CHECK_TYPES = ["ability", "save", "skill", "tool"];

async function refEntry(actor: any, ref: BarRef): Promise<Entry | undefined> {
  const { type, id } = ref;
  if (CHECK_TYPES.includes(type)) return checkEntry(actor, type, id);
  if (type !== "item" && type !== "activity" && type !== "effect") return undefined;
  const doc = await fromUuid(id, { relative: actor });
  if (!doc) return undefined;
  if (type === "item") return { ...itemEntry(doc), ref };
  if (type === "effect") return { ...effectEntry(doc), ref };
  const item = doc.item;
  const description = enrich(doc.description?.chatFlavor || item.system.description?.value, item);
  return {
    ref,
    name: doc.name && doc.name !== item.name ? `${item.name}: ${doc.name}` : item.name,
    img: doc.img ?? item.img,
    badge: badgeOf(item),
    kind: kindOf(item, doc),
    use: (event) => doc.use({ event }),
    sheet: openSheet(item),
    describe: async () => attackFacts(item, doc) + (await description()),
  };
}

const BARS_FLAG = "bars";

/**
 * What is in the character's bar. Until the player changes it: the favorites of the dnd5e sheet in their order
 * there, then every attack. From the first change on it is the player's own list. It is stored on the user, by
 * character: two users playing the same character each have their own bar for it.
 */
export function barRefs(actor: any): BarRef[] {
  // "bar" on the character: where version 0.1 kept it
  const stored = game.user.getFlag(MODULE_ID, `${BARS_FLAG}.${actor.id}`) ?? actor.getFlag(MODULE_ID, "bar");
  if (Array.isArray(stored)) return stored.filter((r) => r?.type && r?.id).map(({ type, id }) => ({ type, id }));
  let refs: BarRef[] = [...(actor.system.favorites ?? [])]
    .sort(bySort)
    .filter((f: any) => f.type !== "slots") // globes already
    .map(({ type, id }: any) => ({ type, id }));
  for (const item of attacks(actor)) {
    const ref = itemEntry(item).ref!;
    if (!refs.some((r) => r.type === ref.type && r.id === ref.id)) refs = placeInBar(refs, ref);
  }
  return refs;
}

export const setBar = (actor: any, refs: BarRef[]) => game.user.setFlag(MODULE_ID, `${BARS_FLAG}.${actor.id}`, refs);

/** The bar's buttons. What a ref stands for may be gone (a deleted item): it is left out. */
export async function barEntries(actor: any): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const ref of barRefs(actor)) {
    try {
      const entry = await refEntry(actor, ref);
      if (entry) entries.push(entry);
    } catch (e) {
      console.warn(`${MODULE_ID} | ${ref.type} ${ref.id} is left out of the bar`, e);
    }
  }
  return entries;
}

/** The ref of one of the actor's own items dragged from a Foundry sheet, undefined for anything else. */
export function foundryDropRef(actor: any, data: any): BarRef | undefined {
  if (data?.type !== "Item" || typeof data.uuid !== "string") return undefined;
  const id = data.uuid.startsWith(`${actor.uuid}.Item.`) ? data.uuid.slice(actor.uuid.length + 6) : "";
  return id && !id.includes(".") && actor.items.has(id) ? { type: "item", id: `.Item.${id}` } : undefined;
}

/** A spell the character could cast now: cantrips, prepared spells, and spells that need no preparing. */
const castable = (spell: any) =>
  spell.system.level === 0 || !spell.system.canPrepare || Number(spell.system.prepared) > 0;

/**
 * The castable spells by level; with `only` just the ones of that level. The label of a level says what its spells
 * are cast with: the slots left, the higher ones after a plus, and the save DC. After them, each apart:
 * - spells cast with something else (the charges of a wand, uses per day, at will), which say so themselves;
 * - spells of lower levels that do more with a slot of this level, with the dice they have then. A click casts
 *   them with that slot.
 */
export function spellGroups(actor: any, only?: number): Group[] {
  const spells: any[] = (actor.itemTypes?.spell ?? []).filter(castable).sort(byName);
  const levelOf = (spell: any) => Number(spell.system.level) || 0;
  const slots = slotGlobes(actor.system.spells);
  const badge = (level: number) => (level > 0 ? spellSlotBadge(actor.system.spells, level) : "");
  const slotted = (spell: any) => (badgeOf(spell) ?? "") === badge(levelOf(spell)) || alsoSlotted(spell);
  const scalable = spells.filter((s) => levelOf(s) > 0 && s.system.canScale !== false && slotted(s));
  const upcast = (level: number) =>
    slots.some((g) => g.level === level)
      ? scalable.filter((s) => levelOf(s) < level && gainsFrom(s, level - levelOf(s)))
      : [];

  const levels = new Set<number>(spells.map(levelOf));
  for (const slot of slots) if (upcast(slot.level).length) levels.add(slot.level);
  const dc = actor.system.attributes?.spell?.dc;
  const tags: Tag[] = dc
    ? [{ icon: "fa-solid fa-shield-halved", text: String(dc), tooltip: loc("DND5E.SpellDC") }]
    : [];
  return [...levels]
    .filter((level) => only === undefined || level === only)
    .sort((a, b) => a - b)
    .flatMap((level) => {
      const own = spells.filter((s) => levelOf(s) === level);
      const groups: Group[] = [
        {
          label: CONFIG.DND5E.spellLevels?.[level] ?? String(level),
          note: badge(level) || undefined,
          tags,
          // A spell with uses of its own besides the slots still shows how many are left
          entries: own
            .filter(slotted)
            .map((s) => ({ ...itemEntry(s), badge: alsoSlotted(s) ? freeBadge(s) : undefined })),
        },
      ];
      const others = own.filter((s) => !slotted(s));
      if (others.length) {
        groups.push({ label: loc("BEAVERS_ACTION_HUD.drawer.otherUses"), sub: true, entries: others.map(itemEntry) });
      }
      const higher = upcast(level);
      if (higher.length) {
        // The slots of that level that are left, a pact slot only if there is no other
        const slot = slots.find((g) => g.level === level && g.value > 0) ?? slots.find((g) => g.level === level);
        groups.push({
          label: loc("BEAVERS_ACTION_HUD.drawer.upcast"),
          sub: true,
          entries: higher.map((s) => ({
            ...itemEntry(s),
            badge: undefined,
            tags: spellTags(s, level - levelOf(s)),
            use: (event: Event) => s.use({ event, spell: { slot: slot?.key } }),
          })),
        });
      }
      return groups;
    });
}

/** What the character carries, by item type. Items inside a container stay in it. */
export function inventoryGroups(actor: any): Group[] {
  const types = new Map<string, any[]>();
  for (const item of actor.items) {
    if (!("quantity" in item.system) || item.system.container) continue;
    if (!types.has(item.type)) types.set(item.type, []);
    types.get(item.type)!.push(item);
  }
  return [...types.entries()].map(([type, items]) => ({
    label: loc(CONFIG.Item.typeLabels?.[type] ?? type),
    entries: items
      .sort(byName)
      .map((item) => ({ ...itemEntry(item), tags: gearTags(item), toggle: equipToggle(item) })),
  }));
}

/** Features: the ones that do something first, the passive ones after. */
export function featureGroups(actor: any): Group[] {
  const feats = [...(actor.itemTypes?.feat ?? [])].sort(byName);
  const active = feats.filter((f: any) => f.system.activities?.size);
  const passive = feats.filter((f: any) => !f.system.activities?.size);
  return [
    { label: loc("BEAVERS_ACTION_HUD.drawer.active"), entries: active.map(itemEntry) },
    { label: loc("BEAVERS_ACTION_HUD.drawer.passive"), entries: passive.map(itemEntry) },
  ].filter((g) => g.entries.length);
}

/** Everything rolled with an ability: its checks, its saving throws, the skills. */
export function checkGroups(actor: any): Group[] {
  const abilities = Object.keys(actor.system.abilities ?? {});
  const entries = (type: string, ids: string[]) =>
    ids.map((id) => checkEntry(actor, type, id)).filter((e): e is Entry => !!e);
  return [
    { label: loc("BEAVERS_ACTION_HUD.checks.abilities"), entries: entries("ability", abilities) },
    { label: loc("BEAVERS_ACTION_HUD.checks.saves"), entries: entries("save", abilities) },
    {
      label: loc("BEAVERS_ACTION_HUD.checks.skills"),
      entries: entries("skill", Object.keys(actor.system.skills ?? {})).sort(byName),
    },
  ].filter((g) => g.entries.length);
}

const leveled = (condition: string) => Number.isFinite(CONFIG.DND5E.conditionTypes?.[condition]?.levels);

/** The condition an effect of that type is, e.g. "prone". */
const conditionOf = (effect: any): string => effect.system?.type ?? [...(effect.statuses ?? [])][0] ?? "";

/**
 * The effects on the character, also the ones its items give, sorted like on the dnd5e sheet.
 * - Active: what lasts a while. A click switches it off.
 * - Passive: what is simply in force, like a trait of the species. Nothing to do with these here.
 * - Inactive: a click switches it on again. One of the character's own can be removed for good; one of an item
 *   belongs to that item.
 * - Conditions: the ones the character has, each to be removed. With `adding` every other condition follows, to be
 *   picked; `added` is called then.
 */
export function effectGroups(actor: any, adding = false, added?: () => void): Group[] {
  const effects: any[] = Array.from<any>(actor.allApplicableEffects?.() ?? actor.effects)
    .filter((e) => !e.isConcealed)
    .sort(byName);
  const conditions = effects.filter((e) => e.type === "condition");
  const others = effects.filter((e) => e.type !== "condition");
  const active = others.filter((e) => !inactive(e) && e.isTemporary).map(effectEntry);
  const passive = others
    .filter((e) => !inactive(e) && !e.isTemporary)
    .map((e) => ({ ...effectEntry(e), use: () => undefined }));
  const off = others.filter(inactive).map((e) => ({
    ...effectEntry(e),
    // What its item suppresses is not switched on here
    use: () => (e.disabled ? e.update({ disabled: false }) : undefined),
    remove: e.parent === actor ? () => e.deleteDialog() : undefined,
  }));
  const groups: Group[] = [
    { label: loc("BEAVERS_ACTION_HUD.drawer.active"), entries: active },
    { label: loc("BEAVERS_ACTION_HUD.drawer.passive"), entries: passive },
    { label: loc("BEAVERS_ACTION_HUD.drawer.inactive"), entries: off },
  ].filter((g) => g.entries.length);

  const has = new Set(conditions.map(conditionOf));
  groups.push({
    label: loc("DND5E.Conditions"),
    button: {
      action: "conditions",
      icon: adding ? "fa-solid fa-minus" : "fa-solid fa-plus",
      label: loc("BEAVERS_ACTION_HUD.drawer.addCondition"),
      active: adding,
    },
    entries: conditions.map((e) => ({
      name: e.name,
      img: e.img,
      use: () => undefined,
      // A level less of exhaustion, the others go
      remove: () => (leveled(conditionOf(e)) ? actor.toggleStatusEffect(conditionOf(e), { levels: -1 }) : e.delete()),
      sheet: openSheet(e),
      describe: enrich(e.description, e),
    })),
  });
  if (adding) {
    const types = Object.entries<any>(CONFIG.DND5E.conditionTypes ?? {})
      .filter(([id, c]) => !c.pseudo && (!has.has(id) || leveled(id)))
      .map(([id, c]) => ({ id, name: loc(c.name), img: c.img ?? c.icon ?? "icons/svg/aura.svg" }))
      .sort(byName);
    groups.push({
      label: loc("BEAVERS_ACTION_HUD.drawer.addCondition"),
      sub: true,
      entries: types.map((c) => ({
        name: c.name,
        img: c.img,
        use: async () => {
          await actor.toggleStatusEffect(c.id, leveled(c.id) ? { levels: 1 } : { active: true });
          added?.();
        },
      })),
    });
  }
  return groups;
}

/**
 * The journals the user sees in Foundry's journal sidebar, by their folder like there. The user's own notes come
 * first, apart from the rest.
 */
export function journalGroups(): Group[] {
  const notes = notesOf();
  const groups: Group[] = [
    {
      label: loc("BEAVERS_ACTION_HUD.journal.notes"),
      entries: [
        {
          name: notes?.name ?? loc("BEAVERS_ACTION_HUD.journal.createNotes"),
          img: "icons/svg/book.svg",
          dimmed: !notes,
          use: openNotes,
        },
      ],
    },
  ];
  const folders = new Map<string, any[]>();
  for (const journal of game.journal) {
    if (journal === notes || !journal.visible) continue;
    const path: string[] = [];
    for (let f = journal.folder; f; f = f.folder) path.unshift(f.name);
    const key = path.join(" / ");
    if (!folders.has(key)) folders.set(key, []);
    folders.get(key)!.push(journal);
  }
  for (const key of [...folders.keys()].sort((a, b) => a.localeCompare(b, game.i18n.lang))) {
    groups.push({
      label: key || loc("BEAVERS_ACTION_HUD.button.journal"),
      entries: folders
        .get(key)!
        .sort(byName)
        .map((j: any) => ({ name: j.name, img: "icons/svg/book.svg", use: openSheet(j) })),
    });
  }
  return groups;
}

/** The tabs of the actor's own sheet, so the bar offers what the sheet offers (also tabs other modules add). */
export function sheetTabs(actor: any): SheetTab[] {
  const tabs: any[] = actor.sheet?.constructor?.TABS ?? [];
  return tabs
    .filter((t) => {
      try {
        return !t.condition || t.condition(actor);
      } catch {
        return false;
      }
    })
    .map((t) => ({ tab: t.tab, label: loc(t.label), icon: t.icon, svg: t.svg }));
}

/** The actor's sheet on one of its tabs. */
export async function openSheetTab(actor: any, tab: string) {
  const sheet = actor.sheet;
  if (!sheet) return;
  if (sheet.rendered) {
    sheet.changeTab?.(tab, "primary");
    sheet.bringToFront?.();
  } else await sheet.render({ force: true, tab });
}
