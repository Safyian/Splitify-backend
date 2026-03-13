import User from "../models/user.js";
import Group from "../models/group.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances, simplifyDebts } from "../utils/balance.js";
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
import { logActivity } from '../utils/activity.helper.js';


// ── Shared helper ─────────────────────────────────────────── ← ✅ FIRST
const getMaxForSettlement = async (group, settlement) => {
  const payerId = settlement.paidBy?._id
    ? settlement.paidBy._id.toString()
    : settlement.paidBy.toString();

  const receiverId = settlement.splits[0].user?._id
    ? settlement.splits[0].user._id.toString()
    : settlement.splits[0].user.toString();

  const expensesWithoutThis = await Expense.find({
    group: group._id,
    _id: { $ne: settlement._id },
  })
    .populate("paidBy")
    .populate("splits.user");

  const balances = calculateGroupBalances(group, expensesWithoutThis);

  const payerBalance = balances[payerId] ?? 0;
  const receiverBalance = balances[receiverId] ?? 0;

  const maxAllowedCents = Math.min(
    Math.abs(Math.min(payerBalance, 0)),
    Math.abs(Math.max(receiverBalance, 0))
  );

  return maxAllowedCents / 100;
};

// ── Create a new expense in a group ────────────────────────────────────────────
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
      paidBy,
      splitType,
      splits: finalSplits
    });

    await logActivity({
    type: 'expense_added',
    actor: req.user,
    group,
      metadata: {
      description: expense.description,
      amount: expense.amount,
      },
    });
    res.status(201).json(expense);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── Get group expenses ────────────────────────────────────────
export const getGroupExpenses = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // ✅ .some() instead of .includes()
    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const expenses = await Expense.find({ group: groupId })
      .populate("paidBy", "name email")
      .populate("splits.user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: expenses.length,
      expenses
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getGroupBalances = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const expenses = await Expense.find({ group: groupId })
      .populate("paidBy", "name")
      .populate("splits.user", "name");

    // ── 1. Net balances (cents) ───────────────────────────────
    const balancesCents = calculateGroupBalances(group, expenses);

    // ── 2. Member name map ────────────────────────────────────
    const members = await User.find({ _id: { $in: group.members } }).select("name");
    const nameMap = {};
    members.forEach(u => { nameMap[u._id.toString()] = u.name; });

    // ── 3. Net balances with names ────────────────────────────
    const balances = Object.entries(balancesCents).map(([userId, cents]) => ({
      userId,
      name: nameMap[userId] || "Unknown",
      net: cents / 100,
    }));

    // ── 4. Simplified debts with names ────────────────────────
    const simplifiedRaw = simplifyDebts(balancesCents);
    const settlements = simplifiedRaw.map(({ from, to, amount }) => ({
      from,
      fromName: nameMap[from] || "Unknown",
      to,
      toName: nameMap[to] || "Unknown",
      amount,
    }));

    // ── 5. Pairwise direct debts ──────────────────────────────
    const memberIds = group.members.map(m => m.toString());
    const pairwise = [];

    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = memberIds[i];
        const b = memberIds[j];

        let aOwesB = 0; // b paid, a was in splits
        let bOwesA = 0; // a paid, b was in splits

        expenses.forEach(expense => {
          const paidBy = expense.paidBy._id
            ? expense.paidBy._id.toString()
            : expense.paidBy.toString();

          if (paidBy === b) {
            const aSplit = expense.splits.find(s => {
              const su = s.user._id ? s.user._id.toString() : s.user.toString();
              return su === a;
            });
            if (aSplit) aOwesB += Math.round(aSplit.amount * 100);
          }

          if (paidBy === a) {
            const bSplit = expense.splits.find(s => {
              const su = s.user._id ? s.user._id.toString() : s.user.toString();
              return su === b;
            });
            if (bSplit) bOwesA += Math.round(bSplit.amount * 100);
          }
        });

        const netCents = bOwesA - aOwesB; // positive = b owes a

        if (Math.abs(netCents) < 1) continue; // skip if settled

        pairwise.push(
          netCents > 0
            ? { from: b, fromName: nameMap[b], to: a, toName: nameMap[a], amount: netCents / 100 }
            : { from: a, fromName: nameMap[a], to: b, toName: nameMap[b], amount: Math.abs(netCents) / 100 }
        );
      }
    }

    // Sort largest debt first
    pairwise.sort((a, b) => b.amount - a.amount);

    res.json({ balances, settlements, pairwise });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Settle up between two users in a group ────────────────────
export const settleUp = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { to, amount } = req.body;

    if (!to || !amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid settlement amount" });
    }

    if (req.user._id.toString() === to.toString()) {
      return res.status(400).json({ message: "You cannot settle with yourself" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = (userId) =>
      group.members.some(m => m.toString() === userId.toString());

    if (!isMember(req.user._id) || !isMember(to)) {
      return res.status(403).json({ message: "Users must be group members" });
    }

    const expenses = await Expense.find({ group: groupId })
      .populate("paidBy", "name")
      .populate("splits.user", "name");

    const balances = calculateGroupBalances(group, expenses);

    const myBalance = balances[req.user._id.toString()] ?? 0;
    const theirBalance = balances[to.toString()] ?? 0;

    const iOweThem = myBalance < 0 && theirBalance > 0;
    const theyOweMe = myBalance > 0 && theirBalance < 0;

    if (!iOweThem && !theyOweMe) {
      return res.status(400).json({
        message: "No outstanding balance between these users"
      });
    }

    let paidByUser, splitUser, maxAllowed;

    if (iOweThem) {
      paidByUser = req.user._id;
      splitUser = to;
      maxAllowed = Math.abs(myBalance);
    } else {
      paidByUser = to;
      splitUser = req.user._id;
      maxAllowed = Math.abs(theirBalance);
    }

    if (amount > maxAllowed + 0.01) {
      return res.status(400).json({
        message: `Amount exceeds outstanding balance of $${maxAllowed.toFixed(2)}`
      });
    }

    const settlement = await Expense.create({
      group: groupId,
      description: "Settlement",
      amount,
      paidBy: paidByUser,
      splitType: "equal",
      splits: [{ user: splitUser, amount, percentage: null }]
    });

    const expensesAfter = await Expense.find({ group: groupId })
      .populate("paidBy", "name")
      .populate("splits.user", "name");

    const balancesAfter = calculateGroupBalances(group, expensesAfter);
    const allSettled = Object.values(balancesAfter).every(b => Math.abs(b) < 0.01);

    if (allSettled) {
      group.settledAt = new Date();
      await group.save();
    }

    await settlement.populate([
      { path: "paidBy", select: "name email" },
      { path: "splits.user", select: "name email" }
    ]);

    const toUser = await User.findById(req.body.to).select('name');

      await logActivity({
        type: 'settlement_made',
        actor: req.user,
        group,
        metadata: {
          amount: req.body.amount,
          toName: toUser?.name ?? 'someone',
          toId: req.body.to,
        },
});
    res.status(201).json({
      message: "Settlement recorded successfully",
      settlement
    });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── Update an existing expense ─────────────────────────────────
export const updateExpense = async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;
    const { description, amount, paidBy, splitType, splits } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const expense = await Expense.findOne({ _id: expenseId, group: groupId });
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (expense.description === "Settlement") {
      return res.status(400).json({ message: "Settlements cannot be edited" });
    }

    validateExpenseInput({ description, amount, splitType, splits });
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

    // ✅ Use findOneAndUpdate to atomically replace splits
    const updatedExpense = await Expense.findOneAndUpdate(
      { _id: expenseId, group: groupId },
      {
        $set: {
          description,
          amount: Math.round(amount * 100) / 100,
          paidBy,
          splitType,
          splits: finalSplits,
        }
      },
      { new: true }
    )
      .populate("paidBy", "name email")
      .populate("splits.user", "name email");

      ///

      const check = await Expense.findById(expenseId)
  .populate("splits.user", "name");

console.log("DB splits after update:");
check.splits.forEach(s => {
  console.log(`  ${s.user.name}: $${s.amount}`);
});


      ///
    await logActivity({
    type: 'expense_updated',
    actor: req.user,
    group,
    metadata: {
    description: expense.description,
    amount: expense.amount,
    },
    });
    res.status(200).json(updatedExpense);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── Update settlement ─────────────────────────────────────────
export const updateSettlement = async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const settlement = await Expense.findOne({
      _id: expenseId,
      group: groupId,
      description: "Settlement",
    }).populate("paidBy").populate("splits.user");

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found" });
    }

    const maxAllowedDollars = await getMaxForSettlement(group, settlement);

    if (maxAllowedDollars <= 0) {
      return res.status(400).json({
        message: "No outstanding balance between these users"
      });
    }

    if (amount > maxAllowedDollars + 0.01) {
      return res.status(400).json({
        message: `Amount exceeds outstanding balance of $${maxAllowedDollars.toFixed(2)}`
      });
    }

    settlement.amount = amount;
    settlement.splits[0].amount = amount;
    await settlement.save();

    const expensesAfter = await Expense.find({ group: groupId })
      .populate("paidBy")
      .populate("splits.user");

    const balancesAfter = calculateGroupBalances(group, expensesAfter);
    const allSettled = Object.values(balancesAfter).every(b => Math.abs(b) < 0.01);

    group.settledAt = allSettled ? new Date() : null;
    await group.save();

    await settlement.populate([
      { path: "paidBy", select: "name email" },
      { path: "splits.user", select: "name email" },
    ]);

    res.status(200).json(settlement);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── Delete expense ────────────────────────────────────────────
export const deleteExpense = async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const expense = await Expense.findOne({ _id: expenseId, group: groupId });
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    await expense.deleteOne();

    if (group.settledAt) {
      const expenses = await Expense.find({ group: groupId })
        .populate("paidBy")
        .populate("splits.user");

      const balances = calculateGroupBalances(group, expenses);
      const allSettled = Object.values(balances).every(b => Math.abs(b) < 0.01);

      if (!allSettled) {
        group.settledAt = null;
        await group.save();
      }
    }

    res.status(200).json({ message: "Expense deleted successfully" });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── Get settlement max ────────────────────────────────────────
export const getSettlementMax = async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const settlement = await Expense.findOne({
      _id: expenseId,
      group: groupId,
      description: "Settlement",
    }).populate("paidBy").populate("splits.user");

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found" });
    }

    const max = await getMaxForSettlement(group, settlement);

    res.status(200).json({ max });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};