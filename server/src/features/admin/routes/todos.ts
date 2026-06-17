import { Router } from "express";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { validateBody } from "../../../middleware/validate.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { logger } from "../../../lib/logger.js";

const router = Router();

const PLANNING_FILE = path.join(process.cwd(), "data", "planning.json");

// Schema convention: PATCH fields that accept null allow callers to clear a
// previously-set value. POST fields use .optional() only — null on create
// would be a no-op.
const MILESTONE_VALUES = ["mvp", "mid-season", "growth", "monetization", "content-seo", "seo-technical"] as const;

const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["not_started", "in_progress", "done"]),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  owner: z.string().optional(),
  milestone: z.enum(MILESTONE_VALUES).optional(),
  instructions: z.array(z.string()).optional(),
  notes: z.string().optional(),
  targetDate: z.string().optional(),
  roadmapLink: z.string().optional(),
  conceptLink: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).strict(); // strict: catches hand-edit drift (typo field names like `prority` are caught at boot)

const todoCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  tasks: z.array(todoTaskSchema),
});

const roadmapItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  effort: z.enum(["Small", "Medium", "Large"]),
  status: z.enum(["planned", "in-progress", "done"]),
  tags: z.array(z.string()).optional(),
}).strict();

const roadmapPhaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  timeframe: z.string(),
  color: z.string().optional(),
  icon: z.string().optional(),
  items: z.array(roadmapItemSchema),
}).strict();

const todoFileSchema = z.object({
  roadmap: z.array(roadmapPhaseSchema).optional(),
  categories: z.array(todoCategorySchema),
  updatedAt: z.string().optional(),
}).strict();

export type TodoFile = z.infer<typeof todoFileSchema>;

export function readTodos(): TodoFile {
  if (!fs.existsSync(PLANNING_FILE)) return { categories: [] };
  return JSON.parse(fs.readFileSync(PLANNING_FILE, "utf-8"));
}

function writeTodos(data: TodoFile): void {
  fs.writeFileSync(PLANNING_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Validate planning.json against the Zod schema.
 * Call from server/src/index.ts at boot alongside env-var validation.
 */
export function validateTodoFileAtBoot(): void {
  if (!fs.existsSync(PLANNING_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(PLANNING_FILE, "utf-8"));
  const parsed = todoFileSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error(
      { errors: parsed.error.format() },
      "planning.json failed schema validation at boot",
    );
    throw new Error(
      "planning.json failed schema validation — check the roadmap/category/task shape and milestone enum values. See logs for details.",
    );
  }
}

/** GET /api/admin/todos — read all categories + todos */
router.get("/admin/todos", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  return res.json(readTodos());
}));

/** GET /api/planning — shared macro roadmap + micro todo state */
router.get("/planning", requireAuth, asyncHandler(async (_req, res) => {
  const data = readTodos();
  return res.json({
    roadmap: data.roadmap ?? [],
    categories: data.categories ?? [],
    updatedAt: data.updatedAt,
  });
}));

/** PATCH /api/admin/todos/:todoId — update a todo */
const updateTodoSchema = z.object({
  status: z.enum(["not_started", "in_progress", "done"]).optional(),
  title: z.string().min(1).max(500).optional(),
  owner: z.string().max(100).optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  targetDate: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional(),
  roadmapLink: z.string().max(200).optional().nullable(),
  conceptLink: z.string().max(200).optional().nullable(),
  milestone: z.enum(MILESTONE_VALUES).optional().nullable(),
});

router.patch("/admin/todos/:todoId", requireAuth, requireAdmin, validateBody(updateTodoSchema), asyncHandler(async (req, res) => {
  const { todoId } = req.params;
  const updates = req.body as z.infer<typeof updateTodoSchema>;
  const data = readTodos();

  let found = false;
  for (const cat of data.categories) {
    const todo = cat.tasks.find((t) => t.id === todoId);
    if (todo) {
      Object.assign(todo, updates);
      todo.updatedAt = new Date().toISOString();
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Todo not found" });

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_UPDATE", resourceType: "AdminTodo", resourceId: todoId, metadata: updates });
  return res.json({ success: true });
}));

/** POST /api/admin/todos — add a new todo to a category */
const addTodoSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(500),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional().default("p2"),
  owner: z.string().max(100).optional().default("dev"),
  instructions: z.array(z.string()).optional().default([]),
  targetDate: z.string().max(50).optional(),
  roadmapLink: z.string().max(200).optional(),
  conceptLink: z.string().max(200).optional(),
  milestone: z.enum(MILESTONE_VALUES).optional(),
});

router.post("/admin/todos", requireAuth, requireAdmin, validateBody(addTodoSchema), asyncHandler(async (req, res) => {
  const { categoryId, title, priority, owner, instructions, targetDate, roadmapLink, conceptLink, milestone } = req.body;
  const data = readTodos();

  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return res.status(404).json({ error: "Category not found" });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").substring(0, 60);
  const newTodo: z.infer<typeof todoTaskSchema> = {
    id,
    title,
    status: "not_started",
    priority,
    owner,
    instructions,
    createdAt: new Date().toISOString(),
  };
  if (targetDate) newTodo.targetDate = targetDate;
  if (roadmapLink) newTodo.roadmapLink = roadmapLink;
  if (conceptLink) newTodo.conceptLink = conceptLink;
  if (milestone) newTodo.milestone = milestone;

  cat.tasks.push(newTodo);

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_CREATE", resourceType: "AdminTodo", resourceId: id, metadata: { categoryId, title } });
  return res.json({ success: true, todo: newTodo });
}));

/** DELETE /api/admin/todos/:todoId — remove a todo */
router.delete("/admin/todos/:todoId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { todoId } = req.params;
  const data = readTodos();

  let found = false;
  for (const cat of data.categories) {
    const idx = cat.tasks.findIndex((t) => t.id === todoId);
    if (idx !== -1) {
      cat.tasks.splice(idx, 1);
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Todo not found" });

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_DELETE", resourceType: "AdminTodo", resourceId: todoId });
  return res.json({ success: true });
}));

export default router;
