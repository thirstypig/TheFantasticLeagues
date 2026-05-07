import { Router } from "express";
import { wireListRouter as crudRouter } from "./routes.js";
import { wireListProcessorRouter } from "./processor.js";

const combined = Router();
combined.use(crudRouter);
combined.use(wireListProcessorRouter);

export const wireListRouter = combined;

