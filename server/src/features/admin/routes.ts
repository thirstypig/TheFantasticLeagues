// server/src/features/admin/routes.ts
import { Router } from "express";
import leagueRouter from "./routes/league.js";
import syncRouter from "./routes/sync.js";
import auditRouter from "./routes/audit.js";
import todosRouter from "./routes/todos.js";
import systemRouter from "./routes/system.js";

export { validateTodoFileAtBoot } from "./routes/todos.js";
export { __resetAdminStatsCacheForTests } from "./routes/system.js";

const router = Router();

router.use(leagueRouter);
router.use(syncRouter);
router.use(auditRouter);
router.use(todosRouter);
router.use(systemRouter);

export const adminRouter = router;
export default adminRouter;
