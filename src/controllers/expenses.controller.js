import Group from "../models/group.js";
import User from "../models/user.js";
import Expense from "../models/expense.js";

export const createExpense = async (req, res) => {
  const { groupId } = req.params;
  const { description, amount, paidBy, splits } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than 0" });
  }

  if (!splits || splits.length === 0) {
    return res.status(400).json({ message: "Splits are required" });
  }

  // 1. Find group
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  // 2. Ensure requester is group member
  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "Not authorized for this group" });
  }

  // 3. Resolve paidBy user
  const paidByUser = await User.findOne({ email: paidBy });
  if (!paidByUser) {
    return res.status(404).json({ message: "PaidBy user not found" });
  }

  // 4. Resolve split users & calculate equal split
  const splitUsers = [];
  const splitAmount = Number((amount / splits.length).toFixed(2));
  const seenUsers = new Set();

  for (const split of splits) {
    const user = await User.findOne({ email: split.email });

    if (!user) {
      return res.status(404).json({
        message: `User not found: ${split.email}`
      });
    }

    // Check for duplicate users in splits
    if (seenUsers.has(user._id.toString())) {
    return res.status(400).json({
      message: "Duplicate users in splits are not allowed"
    });
  }
  seenUsers.add(user._id.toString());

    // Must be group member
    if (!group.members.includes(user._id)) {
      return res.status(400).json({
        message: `${split.email} is not a member of this group`
      });
    }

    splitUsers.push({
      user: user._id,
      amount: splitAmount
    });
  }

  // 5. Create expense
  const expense = await Expense.create({
    group: groupId,
    description,
    amount,
    paidBy: paidByUser._id,
    splits: splitUsers
  });

  res.status(201).json({
    message: "Expense created successfully",
    expenseId: expense._id
  });
};
