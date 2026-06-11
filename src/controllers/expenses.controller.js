import User from "../models/user.js";
import Group from "../models/group.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances, simplifyDebts, calculatePairwiseDebts } from "../utils/balance.js";
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
import { applySettlementState } from '../utils/settlement.helper.js';


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

    await applySettlementState(group);

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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const total = await Expense.countDocuments({ group: groupId });

    const expenses = await Expense.find({ group: groupId })
      .populate("paidBy", "name email")
      .populate("splits.user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      count: expenses.length,
      total,
      page,
      hasMore: skip + expenses.length < total,
      expenses,
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
    const allUserIds = new Set([
      ...group.members.map(m => m.toString()),
      ...expenses.flatMap(e => [
        e.paidBy?._id?.toString() ?? e.paidBy?.toString(),
        ...e.splits.map(s => s.user?._id?.toString() ?? s.user?.toString()),
      ]).filter(Boolean),
    ]);

    const members = await User.find({
      _id: { $in: [...allUserIds] }
    }).select("name");
    const nameMap = {};
    members.forEach(u => { nameMap[u._id.toString()] = u.name; });

    // ── 3. Net balances with names (current members only) ────────────────────────────
    const memberIdSet = new Set(group.members.map(m => m.toString()));

    const balances = Object.entries(balancesCents)
      .filter(([userId]) => memberIdSet.has(userId))
      .map(([userId, cents]) => ({
        userId,
        name: nameMap[userId] || "Unknown",
        net: cents / 100,
      }));

    // ── 4. Build debts — always compute both arrays regardless of balanceMode.
    // `settlements` is always the simplified list; `pairwise` is always the raw direct-debt list.
    const balanceMode = group.balanceMode ?? 'pairwise';
    const memberIds = group.members.map(m => m.toString());

    const pairwiseRaw = calculatePairwiseDebts(memberIds, expenses);
    const pairwiseDebts = pairwiseRaw.map(({ from, to, amount }) => ({
      from,
      fromName: nameMap[from] || 'Unknown',
      to,
      toName: nameMap[to] || 'Unknown',
      amount,
    })).sort((a, b) => b.amount - a.amount);

    const simplifiedRaw = simplifyDebts(balancesCents);
    const simplifiedDebts = simplifiedRaw.map(({ from, to, amount }) => ({
      from,
      fromName: nameMap[from] || 'Unknown',
      to,
      toName: nameMap[to] || 'Unknown',
      amount,
    }));

    res.json({
      balances,
      settlements: simplifiedDebts, // always the simplified list
      pairwise: pairwiseDebts,       // always the raw direct-debt list
      balanceMode,
    });

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

    await applySettlementState(group);

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

    if (expense.settledCycleId != null) {
      return res.status(400).json({
        message: "This is in a settled cycle and can't be edited. Add an adjustment instead.",
        code: "SETTLED_LOCKED",
      });
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

    if (settlement.settledCycleId != null) {
      return res.status(400).json({
        message: "This is in a settled cycle and can't be edited. Add an adjustment instead.",
        code: "SETTLED_LOCKED",
      });
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

    await applySettlementState(group);

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

    if (expense.settledCycleId != null) {
      return res.status(400).json({
        message: "This is in a settled cycle and can't be edited. Add an adjustment instead.",
        code: "SETTLED_LOCKED",
      });
    }

    await expense.deleteOne();

    await logActivity({
      type: 'expense_deleted',
      actor: req.user,
      group,
      metadata: {
        description: expense.description,
        amount: expense.amount,
      },
    });

    await applySettlementState(group);

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