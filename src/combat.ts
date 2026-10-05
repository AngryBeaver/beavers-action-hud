import { hudActor } from "./actorData.js";
import { turnOrder } from "./core/model.js";

/**
 * The combat tracker, top middle: whose turn it is, large and lit, then everybody after them in initiative order.
 * A press on a portrait pings where that combatant stands, for this user only; a double press targets it (or lets
 * go of it). What this user has targeted carries a crosshair. On the turn of the character the HUD shows there is
 * "End turn".
 */

/** A press waits this long for a second one: a double press must not ping. */
const DOUBLE_MS = 300;

let container: HTMLElement | undefined;
/** The combatant pressed once, waiting for a second press. */
let pressed: string | undefined;
let pressTimer = 0;

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The combatant's token on the canvas, if this user sees it there or owns it. If not, the user is told why nothing happens.
 */
function visibleToken(combatantId: string): any {
  const combatant = game.combat?.combatants.get(combatantId);
  const token = combatant?.token?.object;
  // Their own tokens (a companion, a summon) the user may always point at, also out of sight
  if (token && (token.visible || token.isOwner)) return token;
  if (combatant) {
    const message = game.i18n.format("BEAVERS_ACTION_HUD.combat.unseen", { name: combatant.name });
    ui.notifications.info(message);
  }
  return undefined;
}

/** It is the turn of the character the HUD shows: only then the HUD ends the turn. */
function isHudTurn(): boolean {
  const combatant = game.combat?.started ? game.combat.combatant : undefined;
  const actor = hudActor();
  return !!combatant?.isOwner && !!actor && combatant.actor?.uuid === actor.uuid;
}

function render() {
  if (!container) return;
  const combat = game.combat;
  if (!combat?.turns.length) return container.replaceChildren();
  const current = combat.started ? combat.combatant : undefined;
  // In turn order from the current one on; what the player may not know of is left out after that
  const shown = turnOrder<any>(combat.turns, current ? combat.turns.indexOf(current) : 0).filter(
    (c) => c.visible && (!c.hidden || game.user.isGM),
  );
  const portraits = shown.map((c) => {
    const classes = ["bah-combatant"];
    if (c === current) classes.push("active");
    if (c.isDefeated) classes.push("bah-defeated");
    if (c.isOwner) classes.push("bah-own");
    const targeted = !!c.token?.object && game.user.targets.has(c.token.object);
    return `<button type="button" class="${classes.join(" ")}" data-id="${c.id}" data-tooltip="${esc(c.name)}"
        aria-label="${esc(c.name)}">
      <img src="${esc(c.img)}" alt="" draggable="false">
      ${targeted ? `<i class="fa-solid fa-crosshairs bah-target"></i>` : ""}
      ${c.initiative === null || c.initiative === undefined ? "" : `<span class="bah-init">${esc(c.initiative)}</span>`}
    </button>`;
  });
  const round = combat.started
    ? `<span class="bah-round">${game.i18n.format("BEAVERS_ACTION_HUD.combat.round", { round: combat.round })}</span>`
    : "";
  // Foundry's own tracker is hidden with the rest of its interface, so its "End Turn" is here
  const endTurn = isHudTurn()
    ? `<button type="button" class="bah-end-turn"><i class="fa-solid fa-check"></i> ${game.i18n.localize("BEAVERS_ACTION_HUD.combat.endTurn")}</button>`
    : "";
  container.innerHTML = round + portraits.join("") + endTurn;
}

const refresh = foundry.utils.debounce(render, 50);

/** A pulse where the combatant stands, drawn on this client only. */
function ping(id: string) {
  const token = visibleToken(id);
  if (!token) return;
  void Promise.resolve(canvas.controls.drawPing(token.center, { style: "pulse", user: game.user })).catch((e) =>
    console.error("beavers-action-hud | ping failed", e),
  );
}

/** Target the combatant for this user, or let go of it. Other targets stay. */
function target(id: string) {
  const token = visibleToken(id);
  if (!token) return;
  const mode = game.user.targets.has(token) ? "release" : "acquire";
  canvas.tokens.setTargets([token.id], { mode });
  refresh();
}

/**
 * Presses are counted here instead of using the browser's click and double click: those are not reliable on touch
 * screens, and a double click would ping twice before it targets.
 */
function onPress(event: PointerEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest(".bah-end-turn")) {
    event.stopPropagation();
    if (isHudTurn()) {
      void game.combat.nextTurn().catch((e: unknown) => console.error("beavers-action-hud | end turn failed", e));
    }
    return;
  }
  const id = (event.target as HTMLElement).closest<HTMLElement>(".bah-combatant")?.dataset.id;
  if (!id) return;
  event.stopPropagation();
  clearTimeout(pressTimer);
  try {
    if (pressed === id) {
      pressed = undefined;
      target(id);
    } else {
      pressed = id;
      pressTimer = window.setTimeout(() => {
        pressed = undefined;
        ping(id);
      }, DOUBLE_MS);
    }
  } catch (e) {
    pressed = undefined;
    console.error("beavers-action-hud | combat tracker", e);
  }
}

export function setCombatContainer(el: HTMLElement | undefined) {
  container = el;
  el?.addEventListener("pointerup", onPress);
  render();
}

export function registerCombat() {
  const hooks = ["Combat", "Combatant"].flatMap((type) => ["create", "update", "delete"].map((e) => `${e}${type}`));
  // targetToken: the crosshairs. canvasReady: other tokens, so other targets and visibilities.
  // updateUser: the user picked another character to play, whose turn it may be
  for (const hook of [...hooks, "combatStart", "targetToken", "canvasReady", "updateUser"])
    Hooks.on(hook, () => refresh());
}
