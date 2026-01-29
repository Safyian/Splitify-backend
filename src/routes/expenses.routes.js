import express from "express";
import protect from "../middleware/auth.middleware.js";
import { createExpense } from "../controllers/expenses.controller.js";

const router = express.Router();

router.post("/groups/:groupId/expenses", protect, createExpense);

export default router;
