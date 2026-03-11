import Group from "../models/group.js";
import User from "../models/user.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances } from "../utils/balance.js";
import { logActivity } from '../utils/activity.helper.js';

export const createGroup = async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Group name is required' });
  }

  const group = await Group.create({
    name: name.trim(),
    members: [req.user._id],
    createdBy: req.user._id,
  });

  await logActivity({
    type: 'group_created',
    actor: req.user,
    group,
    metadata: { groupName: group.name },
  });

  res.status(201).json({
    id: group._id,
    name: group.name,
    emoji: group.emoji,
    defaultSplitType: group.defaultSplitType,
    members: group.members,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
  });
};

// ── Get all groups ────────────────────────────────────────────────────────────
export const getMyGroups = async (req, res) => {
  const groups = await Group.find({ members: req.user._id })
    .sort({ updatedAt: -1 })
    .select('name members createdBy createdAt');

  const formattedGroups = groups.map((group) => ({
    id: group._id,
    name: group.name,
    memberCount: group.members.length,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
  }));

  res.status(200).json(formattedGroups);
};

// ── Add a member to a group ───────────────────────────────────────────────────
export const addMemberToGroup = async (req, res) => {
  const { groupId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });

  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to add members' });
  }

  const userToAdd = await User.findOne({ email });
  if (!userToAdd) {
    return res.status(404).json({ message: 'User not found. Invite flow coming next.' });
  }

  if (group.members.includes(userToAdd._id)) {
    return res.status(400).json({ message: 'User already a member of the group' });
  }

  group.members.push(userToAdd._id);
  await group.save();

  await logActivity({
    type: 'member_added',
    actor: req.user,
    group,
    metadata: { targetName: userToAdd.name, targetId: userToAdd._id },
  });

  res.status(200).json({
    message: 'Member added successfully',
    groupId: group._id,
    memberId: userToAdd._id,
  });
};

// ── Leave a group ─────────────────────────────────────────────────────────────
export const leaveGroup = async (req, res) => {
  const { groupId } = req.params;

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });

  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: 'You are not a member of this group' });
  }

  const expenses = await Expense.find({ group: groupId });
  const balances = calculateGroupBalances(group, expenses);
  const userBalance = balances[req.user._id.toString()];

  if (userBalance !== 0) {
    return res.status(400).json({
      message: 'You must settle all balances before leaving the group',
      balance: userBalance,
    });
  }

  await logActivity({
    type: 'group_left',
    actor: req.user,
    group,
    metadata: {},
  });

  group.members = group.members.filter(
    (memberId) => memberId.toString() !== req.user._id.toString()
  );
  await group.save();

  res.json({ message: 'You have left the group successfully' });
};

// ── Get groups summary ────────────────────────────────────────────────────────
export const getGroupsSummary = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const groups = await Group.find({ members: userId });
    const summaries = [];

    for (const group of groups) {
      const expenses = await Expense.find({ group: group._id });
      const balances = calculateGroupBalances(group, expenses);
      const myNet = balances[userId] || 0;

      const members = await User.find({ _id: { $in: group.members } }).select('name');
      const nameMap = {};
      members.forEach((u) => { nameMap[u._id.toString()] = u.name; });

      let preview = [];
      Object.entries(balances).forEach(([uid, net]) => {
        if (uid === userId) return;
        if (net === 0) return;
        const name = nameMap[uid] || 'Someone';
        const relationAmount = Math.min(Math.abs(myNet), Math.abs(net));
        if (relationAmount === 0) return;
        if (myNet > 0 && net < 0) {
          preview.push({ userId: uid, name, amount: relationAmount / 100, direction: 'you_receive' });
        }
        if (myNet < 0 && net > 0) {
          preview.push({ userId: uid, name, amount: relationAmount / 100, direction: 'you_pay' });
        }
      });

      preview.sort((a, b) => b.amount - a.amount);

      const netDollars = myNet / 100;
      let status = 'settled';
      if (netDollars > 0) status = 'you_are_owed';
      if (netDollars < 0) status = 'you_owe';

      summaries.push({
        _id: group._id,
        name: group.name,
        emoji: group.emoji ?? '🏠',
        defaultSplitType: group.defaultSplitType ?? 'equal',
        createdBy: group.createdBy.toString(),
        balance: { net: netDollars, status },
        preview: preview.slice(0, 2),
        othersCount: Math.max(0, preview.length - 2),
      });
    }

    res.json(summaries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get group members ─────────────────────────────────────────────────────────
export const getGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    res.status(200).json({
      members: group.members.map((m) => ({ id: m._id, name: m.name, email: m.email })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get group settings ────────────────────────────────────────────────────────
export const getGroupSettings = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId)
      .populate('members', 'name email')
      .populate('createdBy', 'name');

    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    res.json({
      id: group._id,
      name: group.name,
      emoji: group.emoji ?? '🏠',
      defaultSplitType: group.defaultSplitType ?? 'equal',
      createdBy: { id: group.createdBy._id, name: group.createdBy.name },
      members: group.members.map((m) => ({ id: m._id, name: m.name, email: m.email })),
      createdAt: group.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Rename group ──────────────────────────────────────────────────────────────
export const renameGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    const oldName = group.name;
    group.name = name.trim();
    await group.save();

    await logActivity({
      type: 'group_renamed',
      actor: req.user,
      group,
      metadata: { oldName, newName: group.name },
    });

    res.json({ message: 'Group renamed successfully', name: group.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update group emoji ────────────────────────────────────────────────────────
export const updateGroupEmoji = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    group.emoji = emoji;
    await group.save();

    res.json({ message: 'Emoji updated successfully', emoji: group.emoji });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update default split type ─────────────────────────────────────────────────
export const updateDefaultSplitType = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { defaultSplitType } = req.body;

    const valid = ['equal', 'exact', 'percentage'];
    if (!valid.includes(defaultSplitType)) {
      return res.status(400).json({ message: 'Invalid split type. Must be equal, exact, or percentage' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    group.defaultSplitType = defaultSplitType;
    await group.save();

    res.json({ message: 'Default split type updated', defaultSplitType: group.defaultSplitType });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Remove member from group ──────────────────────────────────────────────────
export const removeMemberFromGroup = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group creator can remove members' });
    }

    if (memberId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use the leave group option to remove yourself' });
    }

    if (memberId === group.createdBy.toString()) {
      return res.status(400).json({ message: 'Cannot remove the group creator' });
    }

    const isMember = group.members.some((m) => m.toString() === memberId);
    if (!isMember) return res.status(404).json({ message: 'Member not found in group' });

    const expenses = await Expense.find({ group: groupId });
    const balances = calculateGroupBalances(group, expenses);
    const memberBalance = balances[memberId] ?? 0;

    if (memberBalance !== 0) {
      return res.status(400).json({
        message: 'Member has unsettled balances and cannot be removed',
        balance: memberBalance / 100,
      });
    }

    const removedUser = await User.findById(memberId).select('name');

    group.members = group.members.filter((m) => m.toString() !== memberId);
    await group.save();

    await logActivity({
      type: 'member_removed',
      actor: req.user,
      group,
      metadata: { targetName: removedUser?.name ?? 'Unknown', targetId: memberId },
    });

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Delete group ──────────────────────────────────────────────────────────────
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group creator can delete the group' });
    }

    const expenses = await Expense.find({ group: groupId });
    const balances = calculateGroupBalances(group, expenses);
    const hasUnsettled = Object.values(balances).some((b) => b !== 0);

    if (hasUnsettled) {
      return res.status(400).json({ message: 'All balances must be settled before deleting the group' });
    }

    await logActivity({
      type: 'group_deleted',
      actor: req.user,
      group,
      metadata: { groupName: group.name },
    });

    await Expense.deleteMany({ group: groupId });
    await Group.findByIdAndDelete(groupId);

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};