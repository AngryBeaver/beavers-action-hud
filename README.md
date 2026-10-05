# Beaver's Action HUD

A Foundry VTT v14 module for **dnd5e** that replaces Foundry's interface with a HUD.
The Idea is from oldschool computer games like Diablo: globes, an action bar, a minimap.
<img width="1564" height="899" alt="image" src="https://github.com/user-attachments/assets/ce912f16-c8d4-4663-9d71-674830a5d1a5" />


## Features

- **The view follows the character.** The canvas stays centered on the player's token, also while it moves. Zoom
  stays free.
- **Round minimap**, top left: the whole scene with a pin where the character stands. It shows only what the player
  has explored (Foundry's fog of war), and no tokens. Click it or press `M` to **open the map**: Foundry's usual
  interface and free panning, inside a frame, until "Close map" at the top edge.
- **Combat tracker**, top middle: whoever's turn it is comes first, large and lit, everybody else after them in
  initiative order. Click a portrait to ping where that combatant stands (only for this user, and only if they see
  the token), double click to target it or let go of it. Targets carry a crosshair. On the character's own turn
  there is "End turn". Foundry's popped out combat tracker is hidden while the HUD is up.
- **Portrait**, beside the bar: armor class, speed, and buttons for initiative, short rest and long rest. Who owns
  more than one actor clicks the portrait to play another: characters, NPCs, and their summons on the scene. The
  HUD shows that actor and controls its token.
- **Health globe**, bottom right: fills with the hit points, temporary hit points shimmer blue. The ring around it
  is the hit dice left, one segment per die. Click opens the sheet.
- **Dying**: at 0 hit points the health globe shows the death saves, successes and failures. A click rolls the next
  one.
- **Mana globe**, left of the portrait: one globe for all spell slots. The ring around it has a segment per slot
  level (pact slots in purple), filled by the slots left of that level. Click a segment to pick the level: the
  globe shows its slots as left/all in blue, the higher slots still left on top in purple ("+3"), and the spells of
  that level are listed.
- **Action bar**, bottom: starts with the favorites of the dnd5e sheet, then every attack of the character. Click
  uses it like the sheet would. The bar is the player's to arrange: **drag** anything from the drawers or the
  character sheet onto it, drag a button to move it, **right click** removes it. What doesn't fit wraps into a
  second row. From the first change on it is the player's own list, stored per user and per character, so two
  users playing the same character each have their own bar. A spell shows the slots of its level as left/all, plus
  the higher slots it could still be cast with: `1/4 +7`.
- **Descriptions**: rest the pointer on a button or a row and its description shows below the chat messages, then
  fades like they do.
- **Drawers**, popping up from the bar: abilities, saves and skills (click rolls), inventory, features, spells (the
  ones castable right now, by level, with the slots left) and effects (click switches one on or off).
- **Journals**: the journals the player sees in Foundry's sidebar, by folder. On top, apart from them, the player's
  own **notes**: a journal named after the user that only they own, created with the first click. Where players
  may not create journals the gamemaster's client does it, so a gamemaster has to be online that first time.
- **Quick dice**: d4, d6, d8, d10, d12, d20 and d100. Pick normal, advantage or disadvantage and a bonus once, then
  every click on a die rolls it. Nobody has to type into the chat, and the chat button can be switched off in the
  settings.
- **Chat**, top right: the newest three messages as bubbles, each fading a few seconds after it came in. Hover
  keeps one. The chat button shows Foundry's chat sidebar for writing.
- **Leave the HUD** with its exit button or `Ctrl+Shift+H`: Foundry's interface is back, and "Back to the HUD" at
  the top edge returns. Leaving lasts for the browser tab, a reload brings the HUD back.

## Settings

| Setting | Scope | |
|---|---|---|
| Player HUD | device | Automatic (players only), On, Off |
| Scene picture on the minimap | device | Explored parts only (fog of war), Nothing (only the pin), and for a gamemaster Full map (also what was never seen). On scenes without token vision the full map shows. |
| Chat message time | device | Seconds until a message fades |
| Chat button | device | Whether the HUD has the button that shows Foundry's chat for writing |

Keys (Configure Controls): `M` opens or closes the map, `Ctrl+Shift+H` leaves or enters the HUD.

## Which character

The character picked in the HUD (click the portrait); else the user's assigned character; without one, the owned
token they control, else the first character they own.

## Development

```
pnpm install
pnpm test
pnpm build      # dist/
pnpm devbuild   # into the Foundry data folder from package.json "devDir"
```
