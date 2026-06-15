import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import driversRouter from "./drivers";
import brokersRouter from "./brokers";
import loadsRouter from "./loads";
import analyticsRouter from "./analytics";
import weeklyRouter from "./weekly";
import notificationsRouter from "./notifications";
import accountingRouter from "./accounting";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/drivers", driversRouter);
router.use("/brokers", brokersRouter);
router.use("/loads", loadsRouter);
router.use("/analytics", analyticsRouter);
router.use("/weekly", weeklyRouter);
router.use("/notifications", notificationsRouter);
router.use("/accounting", accountingRouter);

export default router;
