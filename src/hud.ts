import {
  availableActors,
  barEntries,
  barRefs,
  checkGroups,
  effectGroups,
  featureGroups,
  foundryDropRef,
  hudActor,
  inventoryGroups,
  journalGroups,
  openSheetTab,
  pickActor,
  setBar,
  sheetTabs,
  spellGroups,
  type Entry,
  type Group,
} from "./actorData.js";
import {
  arcPath,
  DICE,
  diceFormula,
  fraction,
  higherSlots,
  MODULE_ID,
  placeInBar,
  removeFromBar,
  ringPoint,
  ringSegments,
  slotGlobes,
  type BarRef,
  type RollMode,
} from "./core/model.js";
import { setCombatContainer } from "./combat.js";
import { setFollowing, setMinimap } from "./map.js";
import { getSetting, hasExited, hudEnabled, hudWanted, S, setExited } from "./settings.js";
import { setToastContainer } from "./toasts.js";

/**
 * The HUD itself: one element over the canvas. Body classes do the rest in CSS: `bah-hud` hides Foundry's
 * interface, `bah-map` brings it back inside a frame, `bah-chat` shows the sidebar for writing.
 */

const L = (key: string) => game.i18n.localize(`BEAVERS_ACTION_HUD.${key}`);
const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CHECKS = "checks";
/** What the HUD lists of the character, each in a drawer, in the order of their buttons. */
const DRAWERS: Record<string, (actor: any) => Group[]> = {
  [CHECKS]: checkGroups,
  inventory: inventoryGroups,
  features: featureGroups,
  spells: (actor) => spellGroups(actor, spellLevel),
  effects: effectGroups,
};
/** Their icons, where the character sheet has no tab to take it from. */
const ICONS: Record<string, string> = {
  [CHECKS]: "fa-solid fa-list-check",
  inventory: "fa-solid fa-suitcase",
  features: "fa-solid fa-list",
  spells: "fa-solid fa-book",
  effects: "fa-solid fa-bolt",
};
const JOURNAL = "journal";
const DICE_DRAWER = "dice";
/** Drawers that are no tab of the sheet. */
const OWN_DRAWERS = [JOURNAL, DICE_DRAWER];
const ROLL_MODES: RollMode[] = ["disadvantage", "normal", "advantage"];

/** The data type of a bar ref while it is dragged. */
const DRAG_TYPE = "application/x-beavers-action-hud";
/** How long the pointer rests on an entry until its description shows. */
const HOVER_MS = 600;
const FADE_MS = 2000;

let root: HTMLElement | undefined;
let bottom: HTMLElement;
/** The description of the entry hovered last, below the chat messages. */
let info: HTMLElement;
let infoTimer = 0;
let hovered: HTMLElement | undefined;
let hoverTimer = 0;
let drawer: string | undefined;
let mapOpen = false;
let chatOpen = false;
/** The list of the user's other characters is open, to play another one. */
let picking = false;
/** Set by a click on a slot globe: the spells drawer then lists the spells of that level only. */
let spellLevel: number | undefined;
/** The slot level the mana globe shows, a key of the actor's `system.spells`. Picked on the ring around it. */
let slotKey: string | undefined;
/** The quick roll options stay as set, roll after roll. */
let rollMode: RollMode = "normal";
let rollBonus = 0;
/** Shown instead of the HUD after the user left it: the way back. */
let pill: HTMLElement | undefined;
/** What the buttons of the last render do, by their data-idx. */
let entries: Entry[] = [];
let renders = 0;

function register(entry: Entry): number {
  entries.push(entry);
  return entries.length - 1;
}

function actionButton(entry: Entry): string {
  return `<button type="button" class="bah-action${entry.dimmed ? " bah-dimmed" : ""}" data-action="use" draggable="true"
    data-idx="${register(entry)}" data-tooltip="${esc(entry.name)}" aria-label="${esc(entry.name)}">
    <img src="${esc(entry.img)}" alt="" draggable="false">${entry.badge ? `<span class="bah-badge">${esc(entry.badge)}</span>` : ""}
  </button>`;
}

/** dnd5e's own pictures of abilities and skills are dark, drawn for its light sheet. */
const darkPicture = (img: string) => (/^systems\/dnd5e\/icons\/svg\//.test(img) ? ` class="bah-dark"` : "");

function drawerRow(entry: Entry): string {
  return `<button type="button" class="bah-row${entry.dimmed ? " bah-dimmed" : ""}" data-action="use"${entry.ref ? ` draggable="true"` : ""}
    data-idx="${register(entry)}">
    <img src="${esc(entry.img)}"${darkPicture(entry.img)} alt="" draggable="false"><span class="bah-name">${esc(entry.name)}</span>
    ${entry.badge ? `<span class="bah-badge">${esc(entry.badge)}</span>` : ""}
  </button>`;
}

/** Quick rolls: the options on top, a click on a die rolls it right away. */
function diceHtml(): string {
  const modes = ROLL_MODES.map(
    (m) => `<button type="button" class="bah-mode${m === rollMode ? " active" : ""}" data-action="roll-mode"
      data-tab="${m}">${L(`dice.${m}`)}</button>`,
  ).join("");
  const dice = DICE.map(
    (faces) => `<button type="button" class="bah-die" data-action="roll" data-tab="${faces}"
      data-tooltip="${esc(diceFormula(faces, rollMode, rollBonus))}">d${faces}</button>`,
  ).join("");
  return `<div class="bah-dice-options">
      <div class="bah-modes">${modes}</div>
      <label class="bah-bonus">${L("dice.bonus")}
        <button type="button" data-action="roll-bonus" data-tab="-1" aria-label="-1">−</button>
        <input type="number" step="1" value="${rollBonus}">
        <button type="button" data-action="roll-bonus" data-tab="1" aria-label="+1">+</button>
      </label>
    </div>
    <div class="bah-dice">${dice}</div>`;
}

async function quickRoll(faces: number) {
  const roll = new Roll(diceFormula(faces, rollMode, rollBonus));
  const flavor = rollMode === "normal" ? undefined : L(`dice.${rollMode}`);
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: hudActor() }), flavor });
}

function groupsHtml(groups: Group[]): string {
  if (!groups.length) return `<p class="bah-empty">${L("drawer.empty")}</p>`;
  return groups
    .map(
      (g) => `<h4>${esc(g.label)}${g.note ? `<span class="bah-note">${esc(g.note)}</span>` : ""}</h4>
        <div class="bah-rows">${g.entries.map(drawerRow).join("")}</div>`,
    )
    .join("");
}

function drawerHtml(actor: any, title: string): string {
  const body =
    drawer === DICE_DRAWER
      ? diceHtml()
      : groupsHtml(drawer === JOURNAL ? journalGroups() : actor ? DRAWERS[drawer!](actor) : []);
  const sheet = !OWN_DRAWERS.includes(drawer!)
    ? `<button type="button" data-action="sheet" data-tab="${drawer === CHECKS ? "details" : esc(drawer)}" data-tooltip="${L("drawer.sheet")}"
          aria-label="${L("drawer.sheet")}"><i class="fa-solid fa-up-right-from-square"></i></button>`
    : "";
  return `<section class="bah-drawer">
    <header><h3>${esc(title)}</h3>${sheet}
      <button type="button" data-action="close" aria-label="${L("drawer.close")}"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="bah-drawer-body">${body}</div>
  </section>`;
}

function tabButton(action: string, tab: string, label: string, icon: string, active: boolean): string {
  return `<button type="button" class="bah-tab${active ? " active" : ""}" data-action="${action}"
    data-tab="${esc(tab)}" data-tooltip="${esc(label)}" aria-label="${esc(label)}">${icon}</button>`;
}

/**
 * The spell slots as one globe. The ring around it has a segment per slot level, each filled by the slots left of
 * that level. One level is picked, the segment with the light border: the globe shows its slots, and on top of
 * them in purple the slots of higher levels that could be used instead.
 */
function slotsHtml(actor: any): string {
  const globes = slotGlobes(actor.system.spells);
  if (!globes.length) return "";
  const picked = globes.find((g) => g.key === slotKey) ?? globes[0];
  const size = 150;
  const c = size / 2;
  const r = 64;
  const levelLabel = (g: (typeof globes)[number]) =>
    `${CONFIG.DND5E.spellLevels?.[g.level] ?? g.level}: ${g.value}/${g.max}`;
  const segments = ringSegments(globes.length, globes.length > 1 ? 8 : 0.01);
  const ring = globes
    .map((g, i) => {
      const { start, end } = segments[i];
      const filled = start + (end - start) * fraction(g.value, g.max);
      const label = ringPoint(c, c, r, (start + end) / 2);
      const classes = ["bah-seg", g.pact ? "bah-pact" : "", g === picked ? "active" : ""].filter(Boolean).join(" ");
      return `<g class="${classes}" data-action="slot" data-tab="${esc(g.key)}" data-tooltip="${esc(levelLabel(g))}">
        ${g === picked ? `<path class="bah-seg-border" d="${arcPath(c, c, r, start, end)}"/>` : ""}
        <path class="bah-seg-track" d="${arcPath(c, c, r, start, end)}"/>
        ${g.value > 0 ? `<path class="bah-seg-fill" d="${arcPath(c, c, r, start, filled)}"/>` : ""}
        <text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}">${g.level}</text>
      </g>`;
    })
    .join("");
  const higher = higherSlots(globes, picked.level);
  // A full globe is every slot of the level plus the higher ones left: blue its own, purple on top the higher ones
  const own = Math.round(fraction(picked.value, picked.max + higher) * 100);
  const extra = Math.round(fraction(higher, picked.max + higher) * 100);
  return `<div class="bah-mana">
    <svg class="bah-ring" viewBox="0 0 ${size} ${size}">${ring}</svg>
    <div class="bah-globe bah-slot${picked.pact ? " bah-pact" : ""}" data-action="slot" data-tab="${esc(picked.key)}"
        data-tooltip="${esc(levelLabel(picked))}">
      <div class="bah-liquid" style="height:${own}%"></div>
      ${higher ? `<div class="bah-liquid bah-liquid-extra" style="bottom:${own}%;height:${extra}%"></div>` : ""}
      ${higher ? `<span class="bah-globe-plus">+${higher}</span>` : ""}
      <span class="bah-globe-text">${picked.value}<small>/${picked.max}</small></span>
    </div>
  </div>`;
}

function healthHtml(actor: any): string {
  const hp = actor.system.attributes?.hp;
  if (!hp) return "";
  const max = hp.effectiveMax ?? (Number(hp.max) || 0) + (Number(hp.tempmax) || 0);
  const temp = Number(hp.temp) || 0;
  // The hit dice left are a ring around the globe, one segment per die
  const hd = actor.system.attributes.hd;
  const dice = Number(hd?.max) || 0;
  const left = Math.min(dice, Math.max(0, Number(hd?.value) || 0));
  const ring = dice ? ` style="--bah-hd:${(left / dice) * 360}deg;--bah-hd-step:${360 / dice}deg"` : "";
  const tooltip = dice ? `${actor.name} · ${L("stats.hitDice")}: ${left}/${dice}` : actor.name;
  // Dying: the globe is the death saves, a click rolls the next one
  const death = actor.system.attributes.death;
  if (death && max > 0 && Number(hp.value) <= 0) {
    const pips = (count: unknown, kind: string) =>
      `<span class="bah-pips">${[0, 1, 2].map((i) => `<i class="${i < Number(count) ? kind : ""}"></i>`).join("")}</span>`;
    return `<div class="bah-hd${dice ? "" : " bah-no-hd"}"${ring} data-tooltip="${L("stats.deathSave")}">
      <div class="bah-globe bah-health bah-dying" data-action="death-save">
        <span class="bah-globe-text"><i class="fa-solid fa-skull"></i>
          ${pips(death.success, "bah-success")}${pips(death.failure, "bah-failure")}
        </span>
      </div>
    </div>`;
  }
  return `<div class="bah-hd${dice ? "" : " bah-no-hd"}"${ring} data-tooltip="${esc(tooltip)}">
    <div class="bah-globe bah-health${temp ? " bah-temp" : ""}" data-action="sheet" data-tab="details">
      <div class="bah-liquid" style="height:${Math.round(fraction(hp.value, max) * 100)}%"></div>
      <span class="bah-globe-text">${hp.value ?? 0}<small>/ ${max}</small></span>
      ${temp ? `<span class="bah-globe-level">+${temp}</span>` : ""}
    </div>
  </div>`;
}

/**
 * Who the HUD is for, beside the bar and as high as it: the portrait with armor class, initiative and speed.
 */
function plateHtml(actor: any): string {
  const attr = actor.system.attributes ?? {};
  const init = Number(attr.init?.total ?? attr.init?.mod);
  const speed = attr.movement?.walk;
  const stat = (key: string, icon: string, value: unknown, action = "") =>
    value === undefined || value === null || value === ""
      ? ""
      : `<span class="bah-stat"${action} data-tooltip="${L(`stats.${key}`)}"><i class="${icon}"></i>${esc(value)}</span>`;
  // With several characters to play the portrait switches between them, with one it opens the sheet
  const others = availableActors().filter((a) => a !== actor);
  const picker =
    picking && others.length
      ? `<div class="bah-picker">${others
          .map(
            (a) => `<button type="button" data-action="pick" data-tab="${esc(a.uuid)}">
              <img src="${esc(a.img)}" alt=""><span>${esc(a.name)}</span></button>`,
          )
          .join("")}</div>`
      : "";
  const tooltip = others.length ? `${actor.name} · ${L("button.switch")}` : actor.name;
  const button = (action: string, tab: string, key: string, icon: string, text = "") =>
    `<button type="button" data-action="${action}" data-tab="${tab}" data-tooltip="${L(key)}" aria-label="${L(key)}">
      <i class="${icon}"></i>${text}</button>`;
  return `<div class="bah-plate">${picker}
    <div class="bah-avatar-box">
      <img class="bah-avatar" src="${esc(actor.img)}" alt="" data-action="${others.length ? "avatar" : "sheet"}"
        data-tab="details" data-tooltip="${esc(tooltip)}">
    </div>
    <div class="bah-plate-side">
      <div class="bah-stats">
        ${stat("ac", "fa-solid fa-shield-halved", attr.ac?.value)}
        ${stat("speed", "fa-solid fa-person-running", speed ? `${speed} ${attr.movement.units ?? ""}`.trim() : undefined)}
      </div>
      <div class="bah-plate-buttons">
        ${button("initiative", "", "stats.initiative", "fa-solid fa-bolt", Number.isFinite(init) ? (init >= 0 ? ` +${init}` : ` ${init}`) : "")}
        ${button("rest", "short", "button.shortRest", "fa-solid fa-utensils")}
        ${button("rest", "long", "button.longRest", "fa-solid fa-campground")}
      </div>
    </div>
  </div>`;
}

async function render() {
  if (!root) return;
  const run = ++renders;
  const actor = hudActor();
  const bar = actor ? await barEntries(actor) : [];
  if (!root || run !== renders) return; // unmounted or rendered again while the favorites were read

  entries = [];
  // Label and icon are the ones of the sheet's tab, so the buttons look familiar
  const sheet = new Map((actor ? sheetTabs(actor) : []).map((t) => [t.tab, t]));
  const tabs = (actor ? Object.keys(DRAWERS) : []).map((tab) => {
    const t = sheet.get(tab);
    return {
      tab,
      label: t?.label ?? L(`button.${tab}`),
      icon: t?.icon ?? (t?.svg ? undefined : ICONS[tab]),
      svg: t?.svg,
    };
  });
  if (drawer && !OWN_DRAWERS.includes(drawer) && !actor) drawer = undefined;
  const tabButtons = tabs.map((t) => {
    const icon = t.icon ? `<i class="${esc(t.icon)}"></i>` : `<img src="${esc(t.svg)}" alt="">`;
    return tabButton("drawer", t.tab, t.label, icon, drawer === t.tab);
  });
  tabButtons.push(
    tabButton("drawer", JOURNAL, L("button.journal"), `<i class="fa-solid fa-book-open"></i>`, drawer === JOURNAL),
    tabButton("drawer", DICE_DRAWER, L("button.dice"), `<i class="fa-solid fa-dice-d20"></i>`, drawer === DICE_DRAWER),
  );
  if (getSetting<boolean>(S.CHAT)) {
    tabButtons.push(tabButton("chat", "", L("button.chat"), `<i class="fa-solid fa-comments"></i>`, chatOpen));
  }
  tabButtons.push(tabButton("exit", "", L("button.exit"), `<i class="fa-solid fa-right-from-bracket"></i>`, false));
  const title = OWN_DRAWERS.includes(drawer!)
    ? L(`button.${drawer}`)
    : drawer === "spells" && spellLevel !== undefined
      ? (CONFIG.DND5E.spellLevels?.[spellLevel] ?? String(spellLevel))
      : (tabs.find((t) => t.tab === drawer)?.label ?? "");
  bottom.innerHTML = `
    <div class="bah-left">
      <div class="bah-slots">${actor ? slotsHtml(actor) : ""}</div>
    </div>
    <div class="bah-center">
      ${drawer ? drawerHtml(actor, title) : ""}
      <div class="bah-barrow">
      ${actor ? plateHtml(actor) : ""}
      <div class="bah-bar">
        <div class="bah-actions">${
          bar.map(actionButton).join("") || `<p class="bah-empty">${L(actor ? "bar.empty" : "bar.noCharacter")}</p>`
        }</div>
        <div class="bah-tabs">${tabButtons.join("")}</div>
      </div>
      </div>
    </div>
    <div class="bah-right">${actor ? healthHtml(actor) : ""}</div>`;
}

/** Many document changes at once (a long rest) are one render. */
export const refresh = foundry.utils.debounce(() => void render(), 50);

function applyClasses() {
  const on = !!root;
  document.body.classList.toggle("bah-hud", on);
  document.body.classList.toggle("bah-map", on && mapOpen);
  document.body.classList.toggle("bah-chat", on && chatOpen);
  setFollowing(on && !mapOpen);
}

export function toggleMap() {
  if (!root) return;
  mapOpen = !mapOpen;
  applyClasses();
}

function toggleChat() {
  chatOpen = !chatOpen;
  if (chatOpen) {
    ui.sidebar?.changeTab?.("chat", "primary");
    ui.sidebar?.expand?.();
  }
  applyClasses();
  refresh();
}

function onClick(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const tab = el.dataset.tab ?? "";
  switch (el.dataset.action) {
    case "use":
      void Promise.resolve(entries[Number(el.dataset.idx)]?.use(event)).catch((e) => console.error(MODULE_ID, e));
      break;
    case "drawer":
      drawer = drawer === tab && spellLevel === undefined ? undefined : tab;
      spellLevel = undefined;
      refresh();
      break;
    case "slot": {
      // Pick the level on the globe and list its spells; the picked level again closes the list
      const globe = slotGlobes(hudActor()?.system.spells).find((g) => g.key === tab);
      if (!globe) break;
      const same = drawer === "spells" && spellLevel === globe.level && slotKey === tab;
      slotKey = tab;
      drawer = same ? undefined : "spells";
      spellLevel = same ? undefined : globe.level;
      refresh();
      break;
    }
    case "initiative":
      void Promise.resolve(hudActor()?.rollInitiativeDialog?.()).catch((e) => console.error(MODULE_ID, e));
      break;
    case "close":
      drawer = undefined;
      refresh();
      break;
    case "sheet": {
      const actor = hudActor();
      if (actor) void openSheetTab(actor, tab);
      break;
    }
    case "avatar":
      picking = !picking;
      refresh();
      break;
    case "pick": {
      const actor = fromUuidSync(tab);
      picking = false;
      drawer = spellLevel = undefined;
      if (actor) void pickActor(actor).catch((e: unknown) => console.error(MODULE_ID, e));
      refresh();
      break;
    }
    case "rest": {
      const actor = hudActor();
      const rest = tab === "long" ? actor?.longRest : actor?.shortRest;
      void Promise.resolve(rest?.call(actor)).catch((e) => console.error(MODULE_ID, e));
      break;
    }
    case "death-save":
      void Promise.resolve(hudActor()?.rollDeathSave?.({ event })).catch((e) => console.error(MODULE_ID, e));
      break;
    case "chat":
      toggleChat();
      break;
    case "map":
      toggleMap();
      break;
    case "roll":
      void quickRoll(Number(tab)).catch((e) => console.error(MODULE_ID, e));
      break;
    case "roll-mode":
      rollMode = tab as RollMode;
      refresh();
      break;
    case "roll-bonus":
      rollBonus += Number(tab);
      refresh();
      break;
    case "exit":
      toggleExit();
      break;
  }
}

/** The bonus typed into its field. */
function onChange(event: Event) {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>(".bah-bonus input");
  if (!input) return;
  rollBonus = Math.trunc(Number(input.value)) || 0;
  refresh();
}

/** Leave the HUD for Foundry's interface, or come back. Lasts for this browser tab. */
export function toggleExit() {
  setExited(!hasExited());
  applyHud();
}

/** Right click: a button of the bar leaves it, a row of a drawer opens its sheet. */
function onContextMenu(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action="use"]');
  const entry = el ? entries[Number(el.dataset.idx)] : undefined;
  if (!el || !entry) return;
  event.preventDefault();
  const actor = hudActor();
  if (el.classList.contains("bah-action")) {
    if (actor && entry.ref) void setBar(actor, removeFromBar(barRefs(actor), entry.ref));
  } else entry.sheet?.();
}

/**
 * Foundry cancels every drag whose target is not itself marked draggable, so the pictures inside the buttons are
 * not: the drag then starts on the button.
 */
function onDragStart(event: DragEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action="use"]');
  const ref = el ? entries[Number(el.dataset.idx)]?.ref : undefined;
  if (!ref || !event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ref));
  event.dataTransfer.effectAllowed = "copyMove";
}

const overBar = (event: DragEvent) => (event.target as HTMLElement).closest<HTMLElement>(".bah-bar");

function onDragOver(event: DragEvent) {
  if (overBar(event)) event.preventDefault(); // the bar takes drops
}

/** Something dropped on the bar goes in front of the button it was dropped on, else to the end. */
function onDrop(event: DragEvent) {
  const actor = hudActor();
  if (!overBar(event) || !actor || !event.dataTransfer) return;
  event.preventDefault();
  event.stopPropagation();
  let ref: BarRef | undefined;
  try {
    const own = event.dataTransfer.getData(DRAG_TYPE);
    ref = own ? JSON.parse(own) : foundryDropRef(actor, JSON.parse(event.dataTransfer.getData("text/plain")));
  } catch {
    return; // nothing the bar knows
  }
  if (!ref?.type || !ref.id) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>(".bah-action");
  const before = target ? entries[Number(target.dataset.idx)]?.ref : undefined;
  void setBar(actor, placeInBar(barRefs(actor), ref, before));
}

function hideInfo() {
  info.classList.add("bah-fading");
  infoTimer = window.setTimeout(() => info.replaceChildren(), FADE_MS);
}

function keepInfo(seconds = getSetting<number>(S.TOAST_SECONDS)) {
  clearTimeout(infoTimer);
  info.classList.remove("bah-fading");
  infoTimer = window.setTimeout(hideInfo, seconds * 1000);
}

async function showInfo(entry: Entry) {
  const target = info;
  const html = await entry.describe?.();
  if (!html || target !== info || !root) return;
  info.innerHTML = `<h4>${esc(entry.name)}</h4><div class="bah-info-text">${html}</div>`;
  keepInfo();
}

/** The pointer resting on an entry for a while shows its description. */
function onPointerOver(event: PointerEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action="use"]') ?? undefined;
  if (el === hovered) return;
  clearTimeout(hoverTimer);
  hovered = el;
  const entry = el ? entries[Number(el.dataset.idx)] : undefined;
  if (entry?.describe) hoverTimer = window.setTimeout(() => void showInfo(entry).catch(console.error), HOVER_MS);
}

function onPointerOut(event: PointerEvent) {
  if (!hovered || hovered.contains(event.relatedTarget as Node | null)) return;
  clearTimeout(hoverTimer);
  hovered = undefined;
}

function mount() {
  root = document.createElement("div");
  root.id = MODULE_ID;
  root.innerHTML = `
    <div class="bah-minimap" data-action="map" data-tooltip="${L("button.map")}"><canvas></canvas></div>
    <div class="bah-combat"></div>
    <div class="bah-side">
      <div class="bah-toasts chat-log"></div>
      <div class="bah-info"></div>
    </div>
    <div class="bah-bottom"></div>
    <div class="bah-frame">
      <button type="button" data-action="map"><i class="fa-solid fa-xmark"></i> ${L("button.closeMap")}</button>
    </div>`;
  bottom = root.querySelector(".bah-bottom")!;
  root.addEventListener("click", onClick);
  root.addEventListener("contextmenu", onContextMenu);
  root.addEventListener("change", onChange);
  root.addEventListener("dragstart", onDragStart);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("drop", onDrop);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  info = root.querySelector<HTMLElement>(".bah-info")!;
  // Reading the description keeps it
  info.addEventListener("pointerenter", () => {
    clearTimeout(infoTimer);
    info.classList.remove("bah-fading");
  });
  info.addEventListener("pointerleave", () => info.childElementCount && keepInfo());
  document.body.append(root);
  setMinimap(root.querySelector("canvas")!);
  setToastContainer(root.querySelector<HTMLElement>(".bah-toasts")!);
  setCombatContainer(root.querySelector<HTMLElement>(".bah-combat")!);
}

function unmount() {
  root?.remove();
  root = hovered = undefined;
  clearTimeout(hoverTimer);
  clearTimeout(infoTimer);
  mapOpen = chatOpen = false;
  drawer = spellLevel = slotKey = undefined;
  setMinimap(undefined);
  setToastContainer(undefined);
  setCombatContainer(undefined);
  picking = false;
}

/** Show or remove the HUD, as the settings say. */
export function applyHud() {
  const on = hudEnabled();
  if (on && !root) mount();
  else if (!on && root) unmount();
  if (!getSetting<boolean>(S.CHAT)) chatOpen = false;
  const left = hudWanted() && hasExited();
  if (left && !pill) {
    pill = document.createElement("button");
    pill.id = `${MODULE_ID}-restore`;
    pill.setAttribute("type", "button");
    pill.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> ${L("button.restore")}`;
    pill.addEventListener("click", toggleExit);
    document.body.append(pill);
  } else if (!left && pill) {
    pill.remove();
    pill = undefined;
  }
  applyClasses();
  refresh();
}

/** Whether a changed document is something the bar shows: the character, or an item or effect on it. */
function concerns(doc: any): boolean {
  const actor = hudActor();
  if (!actor) return false;
  for (let d = doc; d; d = d.parent) if (d === actor) return true;
  return false;
}

export function registerHud() {
  for (const type of ["Actor", "Item", "ActiveEffect"]) {
    for (const event of ["create", "update", "delete"]) {
      Hooks.on(`${event}${type}`, (doc: any) => {
        if (root && concerns(doc)) refresh();
      });
    }
  }
  // Another character: the user got one assigned, or controls another token
  Hooks.on("updateUser", (user: any) => {
    if (root && user === game.user) refresh();
  });
  Hooks.on("controlToken", () => root && refresh());
  for (const event of ["create", "update", "delete"]) {
    Hooks.on(`${event}JournalEntry`, () => root && drawer === JOURNAL && refresh());
  }
}
