import { getSetting, S } from "./settings.js";

/**
 * New chat messages bubble up in the top right corner: the newest three, each fading out a while after it came in.
 * They are Foundry's own rendering of the message, so roll results and the buttons of a dnd5e card work in them.
 */

const MAX = 3;
const FADE_MS = 2000;

let container: HTMLElement | undefined;
const timers = new WeakMap<HTMLElement, number>();

export function setToastContainer(el: HTMLElement | undefined) {
  container = el;
}

function remove(el: HTMLElement) {
  clearTimeout(timers.get(el));
  el.remove();
}

/** (Re)start the time until the message fades, then goes. */
function schedule(el: HTMLElement) {
  clearTimeout(timers.get(el));
  el.classList.remove("bah-fading");
  const fade = () => {
    el.classList.add("bah-fading");
    timers.set(
      el,
      window.setTimeout(() => remove(el), FADE_MS),
    );
  };
  timers.set(el, window.setTimeout(fade, getSetting<number>(S.TOAST_SECONDS) * 1000));
}

async function onCreate(message: any) {
  if (!container || !message.visible) return;
  const target = container;
  let html: HTMLElement;
  try {
    html = await message.renderHTML();
  } catch (e) {
    console.warn("beavers-action-hud | chat message not shown", e);
    return;
  }
  if (container !== target) return;
  const toast = document.createElement("div");
  toast.classList.add("bah-toast");
  toast.dataset.messageId = message.id;
  toast.append(html);
  // Reading a message keeps it: the time starts over when the pointer leaves
  toast.addEventListener("pointerenter", () => {
    clearTimeout(timers.get(toast));
    toast.classList.remove("bah-fading");
  });
  toast.addEventListener("pointerleave", () => schedule(toast));
  target.append(toast);
  while (target.children.length > MAX) remove(target.firstElementChild as HTMLElement);
  schedule(toast);
}

function onDelete(message: any) {
  const toast = container?.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`);
  if (toast) remove(toast);
}

export function registerToasts() {
  Hooks.on("createChatMessage", (message: any) => void onCreate(message));
  Hooks.on("deleteChatMessage", onDelete);
}
