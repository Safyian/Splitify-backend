import express from "express";
import protect from "../middleware/auth.middleware.js";
import { createExpense, getGroupBalances, getGroupExpenses, settleUp } from "../controllers/expenses.controller.js";

const router = express.Router();

router.post("/groups/:groupId/expenses", protect, createExpense);

// Get group balances and settlements
router.get("/groups/:groupId/balances", protect, getGroupBalances);

// Get all expenses for a group
router.get("/groups/:groupId/expenses", protect, getGroupExpenses);

// Settle up balances within a group
router.post("/groups/:groupId/settle", protect, settleUp);


export default router;
