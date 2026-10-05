import { MODULE_ID } from "./core/model.js";

export const S = {
  MODE: "mode",
  MINIMAP_IMAGE: "minimapImage",
  TOAST_SECONDS: "toastSeconds",
  CHAT: "chat",
} as const;

/** Fired on this client when a setting changed that decides whether or how the HUD shows. */
export const HOOK_SETTINGS = `${MODULE_ID}.settings`;

const changed = () => Hooks.callAll(HOOK_SETTINGS);

/** Whether this user is a GM. Settings register at init, before `game.user` exists, so this reads the world data. */
export const isGM = (): boolean => {
  if (game.user) return game.user.isGM;
  const user = game.data?.users?.find((u: any) => u._id === game.userId);
  return (user?.role ?? 0) >= CONST.USER_ROLES.ASSISTANT;
};

export function registerSettings() {
  game.settings.register(MODULE_ID, S.MODE, {
    name: "BEAVERS_ACTION_HUD.settings.mode.name",
    hint: "BEAVERS_ACTION_HUD.settings.mode.hint",
    scope: "client",
    config: true,
    type: String,
    default: "auto",
    choices: {
      auto: "BEAVERS_ACTION_HUD.settings.mode.auto",
      on: "BEAVERS_ACTION_HUD.settings.mode.on",
      off: "BEAVERS_ACTION_HUD.settings.mode.off",
    },
    onChange: changed,
  });
  // The full picture would show a player rooms their token has not seen yet, so only a GM gets that choice.
  game.settings.register(MODULE_ID, S.MINIMAP_IMAGE, {
    name: "BEAVERS_ACTION_HUD.settings.minimapImage.name",
    hint: "BEAVERS_ACTION_HUD.settings.minimapImage.hint",
    scope: "client",
    config: true,
    type: String,
    default: "explored",
    choices: {
      explored: "BEAVERS_ACTION_HUD.settings.minimapImage.explored",
      nothing: "BEAVERS_ACTION_HUD.settings.minimapImage.nothing",
      ...(isGM() ? { fullmap: "BEAVERS_ACTION_HUD.settings.minimapImage.fullmap" } : {}),
    },
    onChange: changed,
  });
  game.settings.register(MODULE_ID, S.TOAST_SECONDS, {
    name: "BEAVERS_ACTION_HUD.settings.toastSeconds.name",
    hint: "BEAVERS_ACTION_HUD.settings.toastSeconds.hint",
    scope: "client",
    config: true,
    type: Number,
    default: 8,
    range: { min: 2, max: 60, step: 1 },
  });
  game.settings.register(MODULE_ID, S.CHAT, {
    name: "BEAVERS_ACTION_HUD.settings.chat.name",
    hint: "BEAVERS_ACTION_HUD.settings.chat.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: changed,
  });
}

export const getSetting = <T = any>(key: string): T => game.settings.get(MODULE_ID, key) as T;

const EXIT_KEY = `${MODULE_ID}.exited`;

/** The user left the HUD with its exit button. Only lasts for this browser tab: a reload brings the HUD back. */
export const hasExited = (): boolean => {
  try {
    return sessionStorage.getItem(EXIT_KEY) === "1";
  } catch {
    return false;
  }
};
export const setExited = (exited: boolean) => {
  try {
    if (exited) sessionStorage.setItem(EXIT_KEY, "1");
    else sessionStorage.removeItem(EXIT_KEY);
  } catch {
    /* private mode: there is no leaving the HUD then, the setting still switches it off */
  }
};

/**
 * Whether the settings ask for the HUD on this client. "auto" is players only: a GM needs Foundry's own interface to run the game.
 * Without dnd5e there is nothing the bar could show.
 */
export function hudWanted(): boolean {
  if (game.system.id !== "dnd5e") return false;
  const mode = getSetting<string>(S.MODE);
  if (mode === "on") return true;
  if (mode === "off") return false;
  return !game.user.isGM;
}

/** Whether the HUD shows: asked for, and not left by the user. */
export const hudEnabled = (): boolean => hudWanted() && !hasExited();
