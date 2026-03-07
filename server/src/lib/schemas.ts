import { z } from "zod";

/** Shared schema for adding a league member (used by admin + commissioner routes). */
export const addMemberSchema = z.object({
  userId: z.number().int().positive().optional(),
  email: z.string().email().optional(),
  role: z.enum(["COMMISSIONER", "OWNER", "VIEWER"]),
}).refine(d => d.userId || d.email, { message: "userId or email required" });
