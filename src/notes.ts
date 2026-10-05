import { MODULE_ID } from "./core/model.js";

/**
 * Every user's own journal for notes: named after the user, owned by them alone, one per user. Players usually may
 * not create journals, so the active GM's client creates it for them with a user query.
 */

const QUERY = `${MODULE_ID}.createNotes`;
const QUERY_TIMEOUT_MS = 5000;
const FLAG = "notesOf";

export const notesOf = (user: any = game.user): any =>
  game.journal.find((j: any) => j.getFlag(MODULE_ID, FLAG) === user.id);

function create(user: any): Promise<any> {
  return JournalEntry.implementation.create({
    name: user.name,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [MODULE_ID]: { [FLAG]: user.id } },
    pages: [{ name: user.name, type: "text" }],
  });
}

/** Runs on the GM's client. `user` is set by the server, so it is who really asked. */
async function onQuery(_data: unknown, { user }: { user: any }) {
  const journal = notesOf(user) ?? (await create(user));
  return { id: journal.id };
}

export function registerNotes() {
  CONFIG.queries[QUERY] = onQuery;
}

/** The journal created on the GM's client takes a moment to arrive here. */
async function arrived(id: string): Promise<any> {
  for (let i = 0; i < 20 && !game.journal.get(id); i++) await new Promise((r) => setTimeout(r, 100));
  return game.journal.get(id);
}

/** Open the user's notes; the first time, create them. */
export async function openNotes() {
  let journal = notesOf();
  if (!journal) {
    if (game.user.can("JOURNAL_CREATE")) journal = await create(game.user);
    else {
      const gm = game.users.activeGM;
      if (!gm) {
        ui.notifications.warn("BEAVERS_ACTION_HUD.journal.noGm", { localize: true });
        return;
      }
      const result = await gm.query(QUERY, {}, { timeout: QUERY_TIMEOUT_MS });
      journal = result?.id ? await arrived(result.id) : undefined;
    }
  }
  journal?.sheet?.render({ force: true });
}
