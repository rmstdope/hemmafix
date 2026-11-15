import { z } from "zod";
import { findTemplate } from "./chore-templates";
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

export const isoDate = z.iso.date({ error: "Ogiltigt datum" });

export const choreTitle = z.string().trim().min(1, "Skriv vad som ska göras").max(200, "Max 200 tecken");
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

/** The "new task" form. Recurring is the default; a one-off task may have a due date. */
export const createChoreInput = z
  .object({
    title: choreTitle,
    templateKey: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || findTemplate(v) !== undefined, "Okänd fördefinierad uppgift"),
    ...cadenceFields,
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
    return { title: v.title, roomId: v.roomId, recurrence, dueDate: v.dueDate };
  });
export type EditChoreInput = z.infer<typeof editChoreInput>;

export const instanceId = z.uuid();
export const choreId = z.uuid();
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
