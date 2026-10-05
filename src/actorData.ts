// What the HUD shows of a dnd5e character: read here, drawn in hud.ts.

import { MODULE_ID, placeInBar, spellSlotBadge, type BarRef } from "./core/model.js";
import { notesOf, openNotes } from "./notes.js";

/** One button or drawer row. */
export interface Entry {
  name: string;
  img: string;
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

/** The rich text of a document as HTML, with links and inline rolls like on its sheet. */
const enrich = (text: unknown, doc: any) => async (): Promise<string> => {
  if (!text) return "";
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(String(text), {
    relativeTo: doc,
    rollData: doc.getRollData?.() ?? {},
    secrets: doc.isOwner,
  });
};

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

function badgeOf(item: any): string | undefined {
  const properties = item.type === "weapon" ? item.system.properties : undefined;
  // A weapon that needs ammunition is as good as the ammunition left for it: of a full quiver of 20, more is not shown
  if (properties?.has("amm")) {
    return `${Math.min(QUIVER, Math.max(0, Number(ammunitionOf(item)?.system.quantity) || 0))}/${QUIVER}`;
  }
  const own = item.system.uses;
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
  return {
    name: item.name,
    img: item.img,
    badge: badgeOf(item),
    use: (event) => item.use({ event }),
    sheet: openSheet(item),
    ref: { type: "item", id: `.Item.${item.id}` },
    describe: enrich(item.system.description?.value, item),
  };
}

function effectEntry(effect: any): Entry {
  return {
    name: effect.name,
    img: effect.img,
    dimmed: effect.disabled,
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
  return {
    ref,
    name: doc.name && doc.name !== item.name ? `${item.name}: ${doc.name}` : item.name,
    img: doc.img ?? item.img,
    badge: badgeOf(item),
    use: (event) => doc.use({ event }),
    sheet: openSheet(item),
    describe: enrich(doc.description?.chatFlavor || item.system.description?.value, item),
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

/** The castable spells by level; with `only` just the ones of that level. */
export function spellGroups(actor: any, only?: number): Group[] {
  const levels = new Map<number, any[]>();
  for (const spell of actor.itemTypes?.spell ?? []) {
    const level = Number(spell.system.level) || 0;
    if (!castable(spell) || (only !== undefined && level !== only)) continue;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level)!.push(spell);
  }
  return [...levels.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const slot = actor.system.spells?.[`spell${level}`];
      return {
        label: CONFIG.DND5E.spellLevels?.[level] ?? String(level),
        note: slot?.max ? `${slot.value}/${slot.max}` : undefined,
        entries: levels.get(level)!.sort(byName).map(itemEntry),
      };
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
    entries: items.sort(byName).map(itemEntry),
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

/** The effects on the character, also the ones its items give. A click switches one on or off. */
export function effectGroups(actor: any): Group[] {
  const effects: any[] = Array.from<any>(actor.allApplicableEffects?.() ?? actor.effects).sort(byName);
  return [
    { label: loc("BEAVERS_ACTION_HUD.drawer.active"), entries: effects.filter((e) => !e.disabled).map(effectEntry) },
    { label: loc("BEAVERS_ACTION_HUD.drawer.inactive"), entries: effects.filter((e) => e.disabled).map(effectEntry) },
  ].filter((g) => g.entries.length);
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
