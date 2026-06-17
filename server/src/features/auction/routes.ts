import { Router } from "express";
import stateRouter from "./routes/stateRoutes.js";
import biddingRouter from "./routes/biddingRoutes.js";
import lifecycleRouter from "./routes/lifecycleRoutes.js";
import analyticsRouter from "./routes/analyticsRoutes.js";

// Re-export what external code depended on (tests + cross-feature deps)
export type { AuctionStatus, AuctionTeam, NominationState, AuctionLogEvent, AuctionState } from "./types.js";
export { createDefaultState, calculateMaxBid, checkPositionLimit } from "./lib/auctionStateManager.js";

const router = Router();
router.use(stateRouter);
router.use(biddingRouter);
router.use(lifecycleRouter);
router.use(analyticsRouter);

export const auctionRouter = router;
export default auctionRouter;
