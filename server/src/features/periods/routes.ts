import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = Router();

// GET /api/periods - list all periods with an isActive flag
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const periods = await prisma.period.findMany({
    orderBy: { startDate: "asc" },
  });

  const data = periods.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    isActive: p.status === "active",
  }));

  res.json({ data });
}));

export const periodsRouter = router;
export default periodsRouter;
