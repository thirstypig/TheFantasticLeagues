import { commissionerRouter } from "./routes.js";
import { hubRouter } from "./hubRoutes.js";

commissionerRouter.use(hubRouter);

export { commissionerRouter };
