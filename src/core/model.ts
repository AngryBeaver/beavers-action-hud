// Pure helpers, no Foundry: what the globes and the minimap show.

export const MODULE_ID = "beavers-action-hud";

export interface Point {
  x: number;
  y: number;
}

/** How full a globe is, 0 to 1. A missing or zero maximum is an empty globe. */
export function fraction(value: unknown, max: unknown): number {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.min(1, Math.max(0, v / m));
}

export interface SlotGlobe {
  /** Key in the actor's `system.spells`: spell1..spell9, pact, or what a module added. */
  key: string;
  /** Slot level, what the globe is labelled with. */
  level: number;
  value: number;
  max: number;
  /** Pact slots are drawn in another colour: they are a pool of their own. */
  pact: boolean;
}

/**
 * The spell slots worth a globe: every kind the character has at all (max above 0), lowest level first, pact slots
 * after the regular ones.
 */
export function slotGlobes(spells: Record<string, any> | undefined | null): SlotGlobe[] {
  const globes: SlotGlobe[] = [];
  for (const [key, slot] of Object.entries(spells ?? {})) {
    const max = Number(slot?.max) || 0;
    if (max <= 0) continue;
    const pact = key === "pact" || slot?.type === "pact";
    const level = Number(slot?.level) || Number(key.replace(/\D/g, "")) || 0;
    globes.push({ key, level, value: Math.min(max, Math.max(0, Number(slot?.value) || 0)), max, pact });
  }
  return globes.sort((a, b) => Number(a.pact) - Number(b.pact) || a.level - b.level);
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface SceneFit extends Rect {
  /** Minimap pixels per scene unit. */
  scale: number;
}

/**
 * Where the whole scene lies on a round minimap of `diameter` pixels: as large as it gets with its corners still
 * inside the circle, centered.
 */
export function fitScene(scene: Rect, diameter: number): SceneFit {
  const diagonal = Math.hypot(scene.width, scene.height);
  const scale = diagonal > 0 ? diameter / diagonal : 0;
  const width = scene.width * scale;
  const height = scene.height * scale;
  return { scale, x: (diameter - width) / 2, y: (diameter - height) / 2, width, height };
}

/** Where a scene point is on that minimap. */
export function toMinimap(point: Point, scene: Rect, fit: SceneFit): Point {
  return { x: fit.x + (point.x - scene.x) * fit.scale, y: fit.y + (point.y - scene.y) * fit.scale };
}

export const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export type RollMode = "normal" | "advantage" | "disadvantage";

/**
 * The formula of a quick roll: one die, or two keeping the higher (advantage) or lower (disadvantage), plus or minus
 * a bonus.
 */
export function diceFormula(faces: number, mode: RollMode = "normal", bonus = 0): string {
  const die = mode === "advantage" ? `2d${faces}kh` : mode === "disadvantage" ? `2d${faces}kl` : `1d${faces}`;
  const b = Math.trunc(Number(bonus)) || 0;
  return b ? `${die} ${b > 0 ? "+" : "-"} ${Math.abs(b)}` : die;
}

/** What a button of the bar stands for, like a favorite of the dnd5e sheet: an item, an effect, a skill, ... */
export interface BarRef {
  type: string;
  id: string;
}

export const sameRef = (a: BarRef, b: BarRef) => a.type === b.type && a.id === b.id;

/**
 * The bar with `ref` put in front of `before`, or at the end. A ref is in the bar once: one that is there already
 * moves.
 */
export function placeInBar(bar: BarRef[], ref: BarRef, before?: BarRef): BarRef[] {
  if (before && sameRef(before, ref)) return bar.some((r) => sameRef(r, ref)) ? [...bar] : [...bar, ref];
  const rest = bar.filter((r) => !sameRef(r, ref));
  const at = before ? rest.findIndex((r) => sameRef(r, before)) : -1;
  return at < 0 ? [...rest, ref] : [...rest.slice(0, at), ref, ...rest.slice(at)];
}

export const removeFromBar = (bar: BarRef[], ref: BarRef): BarRef[] => bar.filter((r) => !sameRef(r, ref));

/**
 * The slots a spell of `level` can be cast with, as the text on its button: the slots of its own level as
 * left/all, then "+x" for the slots of higher levels still left to cast it with. "1/4 +7": one of four slots of its
 * level, seven higher ones. Empty for a character without any slot of that level or above.
 */
export function spellSlotBadge(spells: Record<string, any> | undefined | null, level: number): string {
  let value = 0;
  let max = 0;
  let higher = 0;
  let higherMax = 0;
  for (const slot of slotGlobes(spells)) {
    if (slot.level === level) {
      value += slot.value;
      max += slot.max;
    } else if (slot.level > level) {
      higher += slot.value;
      higherMax += slot.max;
    }
  }
  if (!max) return higherMax ? `+${higher}` : "";
  return higher ? `${value}/${max} +${higher}` : `${value}/${max}`;
}

/** The turns of a combat starting with the current one: who acts now, then everybody after them, around the round. */
export function turnOrder<T>(turns: T[], current: number): T[] {
  const at = Number.isInteger(current) && current > 0 && current < turns.length ? current : 0;
  return [...turns.slice(at), ...turns.slice(0, at)];
}

export interface RingSegment {
  /** Degrees, clockwise from the top. */
  start: number;
  end: number;
}

/** A ring cut into `count` equal segments with `gap` degrees between them, the first starting at the top. */
export function ringSegments(count: number, gap = 6): RingSegment[] {
  if (count < 1) return [];
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => ({ start: i * step + gap / 2, end: (i + 1) * step - gap / 2 }));
}

/** The point on a circle at `degrees` clockwise from the top. */
export function ringPoint(cx: number, cy: number, r: number, degrees: number): Point {
  const a = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** The SVG path of the arc from `start` to `end` degrees, clockwise. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const from = ringPoint(cx, cy, r, start);
  const to = ringPoint(cx, cy, r, end);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(from.x)} ${f(from.y)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${f(to.x)} ${f(to.y)}`;
}

/** The slots of higher levels still left: what a spell of `level` can be cast with beyond its own slots. */
export function higherSlots(globes: SlotGlobe[], level: number): number {
  return globes.reduce((sum, g) => sum + (g.level > level ? g.value : 0), 0);
}
