import { Router } from "express";
import * as authController from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";

const router = Router();

router.post("/register", authController.registrar); // solo primer usuario
router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.me);
router.put("/password", authMiddleware, authController.cambiarPassword);

export default router;
