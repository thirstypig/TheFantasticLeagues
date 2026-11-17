import { commissionerRouter } from "./routes.js";
import { hubRouter } from "./hubRoutes.js";
import { ledgerRouter } from "./ledgerRoutes.js";

commissionerRouter.use(hubRouter);
commissionerRouter.use(ledgerRouter);

export { commissionerRouter };
