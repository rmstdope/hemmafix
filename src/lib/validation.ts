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

const choreTitle = z.string().trim().min(1, "Skriv vad som ska göras").max(200, "Max 200 tecken");
const optionalDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

/** The "new task" form. Recurring is the default; a one-off task may have a due date. */
export const createChoreInput = z
  .object({
    title: choreTitle,
    templateKey: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || findTemplate(v) !== undefined, "Okänd fördefinierad uppgift"),
    roomId: z.uuid({ error: "Välj ett rum" }),
    kind: z.enum(["recurring", "once"]).default("recurring"),
    interval: z.coerce
      .number({ error: "Ange hur ofta" })
      .int("Ange ett heltal")
      .min(1, "Minst 1")
      .max(MAX_INTERVAL, `Högst ${MAX_INTERVAL}`)
      .optional(),
    unit: z.enum(RECURRENCE_UNITS).optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    assigneeId: optionalText(100),
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
    return {
      title: v.title,
      templateKey: v.templateKey,
      roomId: v.roomId,
      recurrence,
      /** null: today for a recurring task, no due date for a one-off. */
      firstDueDate: recurrence ? v.startDate : v.dueDate,
      assigneeId: v.assigneeId,
    };
  });
export type CreateChoreInput = z.infer<typeof createChoreInput>;

/**
 * Editing a task: what to do, where, how often, and when it is next due. An empty date
 * means today for a recurring task and no due date for a one-off.
 */
export const editChoreInput = z
  .object({
    title: choreTitle,
    roomId: z.uuid({ error: "Välj ett rum" }),
    kind: z.enum(["recurring", "once"]).default("recurring"),
    interval: z.coerce
      .number({ error: "Ange hur ofta" })
      .int("Ange ett heltal")
      .min(1, "Minst 1")
      .max(MAX_INTERVAL, `Högst ${MAX_INTERVAL}`)
      .optional(),
    unit: z.enum(RECURRENCE_UNITS).optional(),
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
export const floorId = z.uuid();
export const floorName = z.string().trim().min(1, "Våningen behöver ett namn").max(30, "Max 30 tecken");
export const floorDirection = z.enum(["up", "down"]);
export const memberId = z.string().min(1).max(100);
export const roleInput = z.enum(ROLES);
