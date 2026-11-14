import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

export const isoDate = z.iso.date({ error: "Ogiltigt datum" });

export const createTaskInput = z.object({
  title: z.string().trim().min(1, "Skriv vad som ska göras").max(200, "Max 200 tecken"),
  notes: optionalText(2000),
  assigneeId: optionalText(100),
  dueDate: z
    .union([isoDate, z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const taskId = z.uuid();
export const completedFlag = z.boolean();
export const assigneeIdInput = z.string().min(1).max(100).nullable();

export const taskFilter = z.enum(["all", "mine", "unassigned"]).catch("all");
export type TaskFilter = z.infer<typeof taskFilter>;
