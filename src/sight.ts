import { MODULE_ID } from "./core/model.js";
import { getSetting, S } from "./settings.js";

/**
 * Team sight. Foundry shows a player what the tokens see they may observe, and once they control a token, what that
 * one sees. So a player whose character waits in the dark watches a black map while the others play. With team sight
 * the tokens of all players' characters see for this player too: what their own character sees and what they see as
 * a player are two things, and the switch in the HUD goes from one to the other.
 */

/** Whether this user sees with the whole party: the gamemaster allows it and the player has it switched on. */
export const teamSight = (): boolean =>
  !game.user.isGM && getSetting<boolean>(S.TEAM_SIGHT_ALLOWED) && getSetting<boolean>(S.TEAM_SIGHT);

/** Whether the switch is offered: not to a GM, who sees everything, and not where the GM said no. */
export const teamSightOffered = (): boolean => !game.user.isGM && getSetting<boolean>(S.TEAM_SIGHT_ALLOWED);

/** A token of a teammate that can see: of a player's character or companion, not hidden, on the viewed level. */
function teammateSees(token: any): boolean {
  if (!canvas.visibility?.tokenVision || !token.hasSight || token.document.hidden) return false;
  if (canvas.level && token.document.level !== canvas.level.id) return false;
  return !!token.actor?.hasPlayerOwner;
}

/** Ask every token again whether it sees for this user. */
export function refreshSight() {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens.placeables) token.initializeVisionSource();
  canvas.perception.update({ refreshVision: true, refreshLighting: true });
}

export function toggleTeamSight() {
  void game.settings.set(MODULE_ID, S.TEAM_SIGHT, !getSetting<boolean>(S.TEAM_SIGHT));
}

/** After the system set its token class: its answer stands, team sight only adds tokens to it. */
export function registerSight() {
  const proto = CONFIG.Token.objectClass.prototype;
  const original: (this: any) => boolean = proto._isVisionSource;
  proto._isVisionSource = function (this: any) {
    return original.call(this) || (teamSight() && teammateSees(this));
  };
}
