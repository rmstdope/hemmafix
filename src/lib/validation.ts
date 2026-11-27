import { z } from "zod";
import { findTemplate } from "./chore-templates";
import { DEFAULT_COINS, MAX_COINS } from "./coins";
import { ROLES } from "./permissions";
import { MAX_INTERVAL, RECURRENCE_UNITS, type Recurrence } from "./recurrence";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

/** The refusal for an argument no page of the app would send. */
export const INVALID_INPUT = "Ogiltiga uppgifter";
/** A yes or no sent by the app: anything but a boolean is refused, never read as truthy. */
export const flag = z.boolean({ error: INVALID_INPUT });
/** A submitted form. Only the action sees one, so it is parsed there; its fields further in. */
export const formInput = z.instanceof(FormData, { error: INVALID_INPUT });

export const isoDate = z.iso.date({ error: "Ogiltigt datum" });

export const choreTitle = z.string().trim().min(1, "Skriv vad som ska göras").max(200, "Max 200 tecken");
const COINS_ERROR = "Mynt måste vara ett heltal mellan 0 och 100";
/** What a task gives for a tick: whole, 0 to 100. Text from a form or a number from Claude. */
export const coinsInput = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
  z.number({ error: COINS_ERROR }).int(COINS_ERROR).min(0, COINS_ERROR).max(MAX_COINS, COINS_ERROR),
);
/** An empty or missing amount is no amount: undefined. */
const optionalCoins = z.preprocess((v) => (v === "" || v === null ? undefined : v), coinsInput.optional());

const optionalDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

/** What a new task, or a whole routine added at once, shares: where, how often, when, for whom. */
const cadenceFields = {
  roomId: z.uuid({ error: "Välj ett rum" }),
  kind: z.enum(["recurring", "once"], { error: "Välj återkommande eller en gång" }).default("recurring"),
  interval: z.coerce
    .number({ error: "Ange hur ofta" })
    .int("Ange ett heltal")
    .min(1, "Minst 1")
    .max(MAX_INTERVAL, `Högst ${MAX_INTERVAL}`)
    .optional(),
  unit: z.enum(RECURRENCE_UNITS, { error: "Välj dag, vecka eller månad" }).optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  assigneeId: optionalText(100),
};

type Cadence = {
  kind: "recurring" | "once";
  interval?: number;
  unit?: Recurrence["unit"];
  startDate: string | null;
  dueDate: string | null;
};

/** The recurrence and the first due date a cadence stands for; null: today when recurring, none when once. */
function resolveCadence(v: Cadence, ctx: z.RefinementCtx) {
  let recurrence: Recurrence | null = null;
  if (v.kind === "recurring") {
    if (v.interval === undefined || v.unit === undefined) {
      ctx.addIssue({ code: "custom", message: "Ange hur ofta" });
      return z.NEVER;
    }
    recurrence = { unit: v.unit, interval: v.interval };
  }
  return { recurrence, firstDueDate: recurrence ? v.startDate : v.dueDate };
}

/** The "new task" form and Claude's tool. A one-off is the default and may have a due date. */
export const createChoreInput = z
  .object({
    title: choreTitle,
    templateKey: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || findTemplate(v) !== undefined, "Okänd fördefinierad uppgift"),
    ...cadenceFields,
    kind: cadenceFields.kind.unwrap().default("once"),
    coins: optionalCoins,
  })
  .transform((v, ctx) => {
    const { recurrence, firstDueDate } = resolveCadence(v, ctx);
    return {
      title: v.title,
      templateKey: v.templateKey,
      roomId: v.roomId,
      recurrence,
      /** null: today for a recurring task, no due date for a one-off. */
      firstDueDate,
      assigneeId: v.assigneeId,
      coins: v.coins ?? DEFAULT_COINS,
    };
  });
export type CreateChoreInput = z.infer<typeof createChoreInput>;

/** Adding a routine to the home: the same cadence for every task in it, in one room. */
export const addRoutineInput = z
  .object({ routineId: z.uuid({ error: "Rutinen finns inte längre" }), ...cadenceFields })
  .transform((v, ctx) => ({
    routineId: v.routineId,
    roomId: v.roomId,
    ...resolveCadence(v, ctx),
    assigneeId: v.assigneeId,
  }));
export type AddRoutineInput = z.infer<typeof addRoutineInput>;

/**
 * Editing a task: what to do, where, how often, and when it is next due. An empty date
 * means today for a recurring task and no due date for a one-off.
 */
export const editChoreInput = z
  .object({
    title: choreTitle,
    roomId: z.uuid({ error: "Välj ett rum" }),
    kind: z.enum(["recurring", "once"], { error: "Välj återkommande eller en gång" }).default("recurring"),
    interval: z.coerce
      .number({ error: "Ange hur ofta" })
      .int("Ange ett heltal")
      .min(1, "Minst 1")
      .max(MAX_INTERVAL, `Högst ${MAX_INTERVAL}`)
      .optional(),
    unit: z.enum(RECURRENCE_UNITS, { error: "Välj dag, vecka eller månad" }).optional(),
    dueDate: optionalDate,
    /** Undefined leaves the task's amount as it is. */
    coins: optionalCoins,
  })
  .transform((v, ctx) => {
    let recurrence: Recurrence | null = null;
    if (v.kind === "recurring") {
      if (v.interval === undefined || v.unit === undefined) {
        ctx.addIssue({ code: "custom", message: "Ange hur ofta" });
        return z.NEVER;
      }
      recurrence = { unit: v.unit, interval: v.interval };
    }
    return { title: v.title, roomId: v.roomId, recurrence, dueDate: v.dueDate, coins: v.coins };
  });
export type EditChoreInput = z.infer<typeof editChoreInput>;

export const instanceId = z.uuid();
export const choreId = z.uuid();
/** The ticks whose high five notes are closed at once, capped like the other id lists. */
export const instanceIds = z.array(instanceId, { error: INVALID_INPUT }).max(1000, INVALID_INPUT);
/** Skjut upp: an open instance and its new day. */
export const postponeInput = z.object({ id: instanceId, day: isoDate });
/** Ångra after Skjut upp: the old day, and the row versions the move left behind. */
export const undoPostponeInput = z.object({ id: instanceId, to: isoDate, version: z.string().min(1).max(50) });
export const assigneeIdInput = z.string().min(1).max(100).nullable();

/**
 * The board's filters, from the URL: `rum` is a room id, `plan` a floor id, `vem` is
 * "mine", "none" or a member's id. Anything unusable means "no filter".
 */
export const boardFilter = z.object({
  roomId: z.uuid().optional().catch(undefined),
  floorId: z.uuid().optional().catch(undefined),
  who: z.string().min(1).max(100).optional().catch(undefined),
});
export type BoardFilter = z.infer<typeof boardFilter>;

export const householdName = z.string().trim().min(1, "Hemmet behöver ett namn").max(60, "Max 60 tecken");
export const roomName = z.string().trim().min(1, "Skriv rummets namn").max(40, "Max 40 tecken");
export const roomId = z.uuid();
/** A connected app's id: the hash the OAuth provider stores for its authorization code. */
export const connectionId = z.string().min(1).max(200);
export const floorId = z.uuid();
export const floorName = z.string().trim().min(1, "Våningen behöver ett namn").max(30, "Max 30 tecken");
export const floorDirection = z.enum(["up", "down"]);
export const memberId = z.string().min(1).max(100);
export const roleInput = z.enum(ROLES);

export const routineName = z.string().trim().min(1, "Skriv rutinens namn").max(40, "Max 40 tecken");
export const routineTaskTitle = choreTitle;
export const routineId = z.uuid();
export const routineTaskId = z.uuid();

const LIST_TEXT_MAX = "Max 200 tecken";
export const listName = z.string().trim().min(1, "Skriv listans namn").max(200, LIST_TEXT_MAX);
export const listItemText = z.string().trim().min(1, "Skriv vad som ska på listan").max(200, LIST_TEXT_MAX);
export const listId = z.uuid();
export const listItemId = z.uuid();
export const listOrder = z.enum(["alfabetiskt", "andrad", "skapad"]);
/** What Ångra puts back after × or Rensa: the items as they were, in their old places. */
export const restoredItems = z
  .array(z.object({ id: listItemId, text: listItemText, rank: z.number().int().min(0).max(1_000_000_000), doneAt: z.date().nullable() }))
  .max(1000);
