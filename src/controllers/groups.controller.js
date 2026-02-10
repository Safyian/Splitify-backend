import Group from "../models/group.js";
import User from "../models/user.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances } from "../utils/balance.js";

// Create a new group
export const createGroup = async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "Group name is required" });
  }

  const group = await Group.create({
    name: name.trim(),
    members: [req.user._id],
    createdBy: req.user._id
  });

  res.status(201).json({
    id: group._id,
    name: group.name,
    members: group.members,
    createdBy: group.createdBy,
    createdAt: group.createdAt
  });
};

// Get all groups for the authenticated user
export const getMyGroups = async (req, res) => {
  const groups = await Group.find({
    members: req.user._id
  })
    .sort({ updatedAt: -1 })
    .select("name members createdBy createdAt");

  const formattedGroups = groups.map(group => ({
    id: group._id,
    name: group.name,
    memberCount: group.members.length,
    createdBy: group.createdBy,
    createdAt: group.createdAt
  }));

  res.status(200).json(formattedGroups);
};

// Add a member to a group
export const addMemberToGroup = async (req, res) => {
  const { groupId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // 1. Find the group
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  // 2. Only members can add others
  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "Not authorized to add members" });
  }

  // 3. Find user by email
  const userToAdd = await User.findOne({ email });
  if (!userToAdd) {
    return res.status(404).json({
      message: "User not found. Invite flow coming next."
    });
  }

  // 4. Prevent duplicates
  if (group.members.includes(userToAdd._id)) {
    return res.status(400).json({
      message: "User already a member of the group"
    });
  }

  // 5. Add user
  group.members.push(userToAdd._id);
  await group.save();

  res.status(200).json({
    message: "Member added successfully",
    groupId: group._id,
    memberId: userToAdd._id
  });
};

// Leave a group
export const leaveGroup = async (req, res) => {
  const { groupId } = req.params;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "You are not a member of this group" });
  }

  const expenses = await Expense.find({ group: groupId });
  const balances = calculateGroupBalances(group, expenses);

  const userBalance = balances[req.user._id.toString()];

  if (userBalance !== 0) {
    return res.status(400).json({
      message: "You must settle all balances before leaving the group",
      balance: userBalance
    });
  }

  // Remove user from group
  group.members = group.members.filter(
    memberId => memberId.toString() !== req.user._id.toString()
  );

  await group.save();

  res.json({ message: "You have left the group successfully" });
};

// Get summary of all groups for the authenticated user
export const getGroupsSummary = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const groups = await Group.find({
      members: userId
    });

    const summaries = [];

    for (const group of groups) {

      // Get expenses for the group
      const expenses = await Expense.find({ group: group._id });

      // Calculate balances (in cents) 
      const balances = calculateGroupBalances(group, expenses);

      const myNet = balances[userId] || 0;

      // Fetch member names 
      const members = await User.find({
        _id: { $in: group.members }
      }).select("name");

      const nameMap = {};
      members.forEach(u => {
        nameMap[u._id.toString()] = u.name;
      });

      let preview = [];

      // Build pairwise preview for the user
      Object.entries(balances).forEach(([uid, net]) => {
        if (uid === userId) return;
        if (net === 0) return;

        const name = nameMap[uid] || "Someone";

        // pairwise relation amount (in cents)
        const relationAmount =
          Math.min(Math.abs(myNet), Math.abs(net));

        if (relationAmount === 0) return;

        // If I am owed and they owe 
        if (myNet > 0 && net < 0) {
          preview.push({
            userId: uid,
            name,
            amount: relationAmount / 100,
            direction: "you_receive"
          });
        }

        // If I owe and they are owed
        if (myNet < 0 && net > 0) {
          preview.push({
            userId: uid,
            name,
            amount: relationAmount / 100,
            direction: "you_pay"
          });
        }
      });

      // Sort biggest first and limit to 2 for preview
      preview.sort((a, b) => b.amount - a.amount);

      const limitedPreview = preview.slice(0, 2);

      // Determine status based on net balance
      const netDollars = myNet / 100;

      let status = "settled";
      if (netDollars > 0) status = "you_are_owed";
      if (netDollars < 0) status = "you_owe";

      // Push summary for this group
      summaries.push({
        _id: group._id,
        name: group.name,

        balance: {
          net: netDollars,
          status
        },

        preview: limitedPreview,
        othersCount: Math.max(0, preview.length - 2)
      });
    }

    res.json(summaries);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

