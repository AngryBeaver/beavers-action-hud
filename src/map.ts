import { hudActor } from "./actorData.js";
import { fitScene, toMinimap } from "./core/model.js";
import { getSetting, isGM, S } from "./settings.js";

/**
 * The view and the minimap. While the HUD is up the canvas stays centered on the character's token: panning snaps
 * back, zooming stays free. "Map open" lifts that, the canvas then behaves like Foundry's.
 *
 * The minimap is the whole scene with a pin where the character stands. Of the scene's picture it shows what the
 * player has explored (Foundry's fog of war), nothing else: no tokens.
 */

const SIZE = 360; // canvas pixels, drawn at half that size: sharp on dense screens
const MASK = 256; // the explored area is read at this size, enough for a minimap
const EXPLORED_MS = 3000;

let following = false;
let panning = false;
let minimap: HTMLCanvasElement | undefined;
let frame = 0;
let image: HTMLImageElement | undefined;
let imageSrc = "";
/** What the player has explored, as the alpha of a small picture of the scene. */
let explored: HTMLCanvasElement | undefined;
let exploredTimer = 0;
let exploredTexture: any;
let exploredWarned = false;
/** The scene's picture cut to the explored area, before it goes on the minimap. */
const layer = document.createElement("canvas");
layer.width = layer.height = SIZE;

/** The character's token on the viewed scene, the controlled one if there are several. */
export function hudToken(): any {
  if (!canvas?.ready) return undefined;
  const actor = hudActor();
  if (!actor) return undefined;
  const tokens = actor.getActiveTokens?.() ?? [];
  return tokens.find((t: any) => t.controlled) ?? tokens[0];
}

export function setFollowing(on: boolean) {
  following = on;
  recenter();
}

export function setMinimap(el: HTMLCanvasElement | undefined) {
  minimap = el;
  clearInterval(exploredTimer);
  if (el) {
    el.width = el.height = SIZE;
    exploredTimer = window.setInterval(readExplored, EXPLORED_MS);
    readExplored();
  }
  requestDraw();
}

function recenter() {
  if (!following || panning) return;
  const center = hudToken()?.center;
  if (!center) return;
  const pivot = canvas.stage.pivot;
  if (Math.abs(pivot.x - center.x) < 1 && Math.abs(pivot.y - center.y) < 1) return;
  // canvas.pan fires canvasPan again
  panning = true;
  try {
    canvas.pan({ x: center.x, y: center.y });
  } finally {
    panning = false;
  }
}

/** How much of the scene's picture the minimap shows: "all", only the "explored" part, or "none". */
function pictureMode(): "all" | "explored" | "none" {
  const mode = getSetting<string>(S.MINIMAP_IMAGE);
  if (mode === "nothing") return "none";
  // Without token vision the player sees the whole scene on the canvas anyway
  if ((mode === "fullmap" && isGM()) || canvas.scene.tokenVision === false) return "all";
  return "explored";
}

function sceneImage(): HTMLImageElement | undefined {
  const src = canvas.scene.background?.src || canvas.scene.thumb || "";
  if (src !== imageSrc) {
    imageSrc = src;
    image = undefined;
    if (src) {
      const img = new Image();
      img.onload = () => {
        if (imageSrc !== src) return;
        image = img;
        requestDraw();
      };
      img.src = src;
    }
  }
  return image;
}

/**
 * Read Foundry's fog of war: its exploration texture covers the scene, red where the player has been able to see.
 * Drawn small and read back, red becomes the alpha the scene's picture is cut with.
 */
function readExplored() {
  if (!minimap || !canvas?.ready || pictureMode() !== "explored") return;
  try {
    canvas.fog.commit?.(); // what is seen right now counts as explored
    const texture = canvas.fog.sprite?.texture;
    if (!texture?.valid) {
      explored = undefined;
      return requestDraw();
    }
    const renderer = canvas.app.renderer;
    exploredTexture ??= PIXI.RenderTexture.create({ width: MASK, height: MASK });
    const sprite = new PIXI.Sprite(texture);
    sprite.width = sprite.height = MASK;
    renderer.render(sprite, { renderTexture: exploredTexture, clear: true });
    sprite.destroy();
    const read: HTMLCanvasElement = renderer.extract.canvas(exploredTexture);
    const ctx = read.getContext("2d")!;
    const data = ctx.getImageData(0, 0, read.width, read.height);
    for (let i = 0; i < data.data.length; i += 4) data.data[i + 3] = data.data[i];
    ctx.putImageData(data, 0, 0);
    explored = read;
  } catch (e) {
    explored = undefined;
    if (!exploredWarned) console.warn("beavers-action-hud | the explored area could not be read", e);
    exploredWarned = true;
  }
  requestDraw();
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = 11;
  const cy = y - 24;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - r * 0.85, cy + r * 0.55);
  ctx.arc(x, cy, r, Math.PI * 0.82, Math.PI * 0.18);
  ctx.closePath();
  ctx.fillStyle = "#e5463c";
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

function draw() {
  frame = 0;
  const ctx = minimap?.getContext("2d");
  if (!ctx || !canvas?.ready) return;
  const scene = canvas.dimensions.sceneRect;
  const fit = fitScene(scene, SIZE);

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#14110d";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#231d15";
  ctx.fillRect(fit.x, fit.y, fit.width, fit.height);

  const mode = pictureMode();
  const img = mode === "none" ? undefined : sceneImage();
  if (img && mode === "all") ctx.drawImage(img, fit.x, fit.y, fit.width, fit.height);
  else if (img && explored) {
    const cut = layer.getContext("2d")!;
    cut.globalCompositeOperation = "source-over";
    cut.clearRect(0, 0, SIZE, SIZE);
    cut.drawImage(img, fit.x, fit.y, fit.width, fit.height);
    cut.globalCompositeOperation = "destination-in";
    cut.drawImage(explored, fit.x, fit.y, fit.width, fit.height);
    ctx.drawImage(layer, 0, 0);
  }
  ctx.strokeStyle = "rgba(201, 162, 90, 0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(fit.x, fit.y, fit.width, fit.height);

  const own = hudToken();
  if (own) {
    const p = toMinimap(own.center, scene, fit);
    drawPin(ctx, p.x, p.y);
  }
  ctx.restore();
}

/** Redraw the minimap with the next frame; many calls in a frame draw once. */
export function requestDraw() {
  if (!minimap || frame) return;
  frame = requestAnimationFrame(draw);
}

export function registerMap() {
  Hooks.on("canvasPan", recenter);
  // refreshToken also fires for every step of a token's movement animation: the view rides along
  Hooks.on("refreshToken", (token: any) => {
    if (token !== hudToken()) return;
    recenter();
    requestDraw();
  });
  Hooks.on("canvasReady", () => {
    explored = undefined;
    recenter();
    readExplored();
  });
  // updateUser: the user picked another character to play
  for (const hook of ["createToken", "deleteToken", "controlToken", "updateUser"]) {
    Hooks.on(hook, () => {
      recenter();
      requestDraw();
    });
  }
}
