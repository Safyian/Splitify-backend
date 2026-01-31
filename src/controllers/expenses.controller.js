import Group from "../models/group.js";
import Expense from "../models/expense.js";
import {
  calculateGroupBalances,
  simplifyDebts
} from "../utils/balance.js";
import {
  calculateEqualSplits,
  calculatePercentageSplits,
  calculateExactSplits
} from "../utils/splits.js";

import {
  validateExpenseInput,
  validateGroupMembers,
  validatePercentages,
  validateExactSplits
} from "../validators/expense.validator.js";

// Create a new expense in a group
export const createExpense = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { description, amount, paidBy, splitType, splits } = req.body;

    validateExpenseInput({ description, amount, splitType, splits });

    const group = await Group.findById(groupId);
    if (!group) throw new Error("Group not found");

    validateGroupMembers(group, paidBy, splits);

    let finalSplits;

    if (splitType === "equal") {
      finalSplits = calculateEqualSplits(amount, splits);

    } else if (splitType === "percentage") {
      validatePercentages(splits);
      finalSplits = calculatePercentageSplits(amount, splits);

    } else if (splitType === "exact") {
      validateExactSplits(splits);
      finalSplits = calculateExactSplits(amount, splits);
    }

    const expense = await Expense.create({
      group: groupId,
      description,
      amount: Math.round(amount * 100) / 100,
      // amount,
      paidBy,
      splits: finalSplits
    });

    res.status(201).json(expense);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/////

/* ======================================
   GET GROUP BALANCES (CENTS SAFE)
====================================== */

export const getGroupBalances = async (req, res) => {
  try {

    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }
    // Check user is a group member
      if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "Not authorized" });
  }

    // Fetch all group expenses
    const expenses = await Expense.find({ group: groupId });

    /* ---------- CENTS BALANCE ENGINE ---------- */

    const balancesCents = calculateGroupBalances(
      group,
      expenses
    );

    const settlements = simplifyDebts(balancesCents);

    /* ---------- FORMAT RESPONSE ---------- */

    const balances = Object.entries(balancesCents).map(
      ([userId, cents]) => ({
        userId,
        net: cents / 100
      })
    );

    res.json({
      balances,
      settlements
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// Get all expenses for a group
export const getGroupExpenses = async (req, res) => {
  const { groupId } = req.params;

  // 1. Check group exists
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  // 2. Check user is a group member
  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "Not authorized" });
  }

  // 3. Fetch expenses
  const expenses = await Expense.find({ group: groupId })
    .populate("paidBy", "name email")
    .populate("splits.user", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    count: expenses.length,
    expenses
  });
};

// Settle up between two users in a group
export const settleUp = async (req, res) => {
  const { groupId } = req.params;
  const { to, amount } = req.body;

  if (!to || !amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid settlement amount" });
  }

  if (req.user._id.toString() === to.toString()) {
    return res.status(400).json({
      message: "You cannot settle with yourself"
    });
  }

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  if (group.settledAt) {
    return res.status(400).json({
      message: "This group is already fully settled"
    });
  }

  if (
    !group.members.includes(req.user._id) ||
    !group.members.includes(to)
  ) {
    return res.status(403).json({ message: "Users must be group members" });
  }

  const expenses = await Expense.find({ group: groupId });
  const balances = calculateGroupBalances(group, expenses);

  const payerBalance = balances[req.user._id.toString()];
  const receiverBalance = balances[to.toString()];

  if (payerBalance >= 0) {
    return res.status(400).json({
      message: "You do not owe any money in this group"
    });
  }

  if (receiverBalance <= 0) {
    return res.status(400).json({
      message: "Selected user is not owed any money"
    });
  }

  const debt = Math.abs(payerBalance);

  if (amount > debt) {
    return res.status(400).json({
      message: `Settlement amount exceeds outstanding balance (${debt})`
    });
  }

  const settlement = await Expense.create({
    group: groupId,
    description: "Settlement",
    amount,
    paidBy: req.user._id,
    splits: [{ user: to, amount }]
  });

  // Recalculate balances after settlement
  const balancesAfter = calculateGroupBalances(
    group,
    await Expense.find({ group: groupId })
  );

  const allSettled = Object.values(balancesAfter)
    .every(balance => Math.abs(balance) < 0.01);

  if (allSettled) {
    group.settledAt = new Date();
    await group.save();
  }

  res.status(201).json({
    message: "Settlement recorded successfully",
    settlement
  });
};


