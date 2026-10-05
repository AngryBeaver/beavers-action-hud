import { MODULE_ID } from "./core/model.js";
import { registerCombat } from "./combat.js";
import { applyHud, registerHud, toggleExit, toggleMap } from "./hud.js";
import { registerMap, requestDraw } from "./map.js";
import { registerNotes } from "./notes.js";
import { HOOK_SETTINGS, hudWanted, registerSettings, S, setExited } from "./settings.js";
import { registerToasts } from "./toasts.js";

Hooks.once("init", () => {
  registerSettings();
  registerNotes();
  game.keybindings.register(MODULE_ID, "toggleMap", {
    name: "BEAVERS_ACTION_HUD.keybindings.toggleMap",
    editable: [{ key: "KeyM" }],
    onDown: () => {
      toggleMap();
      return true;
    },
  });
  // Same as the exit button and the button that brings the HUD back; where the HUD is off it switches it on
  game.keybindings.register(MODULE_ID, "toggleHud", {
    name: "BEAVERS_ACTION_HUD.keybindings.toggleHud",
    hint: "BEAVERS_ACTION_HUD.keybindings.toggleHudHint",
    editable: [{ key: "KeyH", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      if (hudWanted()) toggleExit();
      else {
        setExited(false);
        void game.settings.set(MODULE_ID, S.MODE, "on");
      }
      return true;
    },
  });
});

Hooks.once("ready", () => {
  registerMap();
  registerToasts();
  registerCombat();
  registerHud();
  Hooks.on(HOOK_SETTINGS, () => {
    applyHud();
    requestDraw();
  });
  applyHud();
});
