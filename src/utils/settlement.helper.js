import mongoose from "mongoose";
import Expense from "../models/expense.js";
import { calculateGroupBalances } from "./balance.js";

export const applySettlementState = async (group) => {
  const expenses = await Expense.find({ group: group._id })
    .populate("paidBy")
    .populate("splits.user");

  const balances = calculateGroupBalances(group, expenses);
  const allSettled = Object.values(balances).every(b => Math.abs(b) < 0.01);

  if (allSettled) {
    const cycleId = new mongoose.Types.ObjectId();
    await Expense.updateMany(
      { group: group._id, settledCycleId: null },
      { $set: { settledCycleId: cycleId } }
    );
    group.settledAt = new Date();
  } else {
    group.settledAt = null;
  }

  await group.save();
  return { allSettled };
};
