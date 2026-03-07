import express from "express";
import protect from "../middleware/auth.middleware.js";
import { createExpense, getGroupBalances, getGroupExpenses, 
settleUp, updateExpense, deleteExpense, 
updateSettlement, getSettlementMax } from "../controllers/expenses.controller.js";

const router = express.Router();

router.post("/groups/:groupId/expenses", protect, createExpense);

// Get group balances and settlements
router.get("/groups/:groupId/balances", protect, getGroupBalances);

// Get all expenses for a group
router.get("/groups/:groupId/expenses", protect, getGroupExpenses);

// Settle up balances within a group
router.post("/groups/:groupId/settle", protect, settleUp);

// Update an existing expense (optional)
router.patch("/groups/:groupId/expenses/:expenseId", protect, updateExpense);

// Delete an expense (optional)
router.delete("/groups/:groupId/expenses/:expenseId", protect, deleteExpense);

// Update a settlement (optional)
router.patch("/groups/:groupId/settlements/:expenseId", protect, updateSettlement);

// Get the maximum settlement amount for a specific expense
router.get("/groups/:groupId/settlements/:expenseId/max", protect, getSettlementMax);


export default router;
