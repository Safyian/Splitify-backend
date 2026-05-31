import Group from "../models/group.js";
import User from "../models/user.js";
import Expense from "../models/expense.js";
import Activity from "../models/activity.js";
import { calculateGroupBalances, calculatePairwiseDebts, simplifyDebts, buildPreview } from '../utils/balance.js';
import { logActivity } from '../utils/activity.helper.js';
import { hashContact } from '../utils/hash.helper.js';

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

  group.adminId = group.createdBy;
  await group.save();

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
  const { userId, email, phone, name } = req.body;

  if (!userId && !email && !phone) {
    return res.status(400).json({ message: 'userId, email, or phone is required' });
  }

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });

  if (!group.members.some(m => m.toString() === req.user._id.toString())) {
    return res.status(403).json({ message: 'Not authorized to add members' });
  }

  let targetUser;

  if (userId) {
    targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
  } else {
    const emailHash = email ? hashContact(email.toLowerCase().trim()) : null;
    const phoneHash = phone ? hashContact(phone.trim()) : null;

    // Reuse existing user or placeholder if hash matches
    targetUser = await User.findOne({
      $or: [
        ...(emailHash ? [{ emailHash }] : []),
        ...(phoneHash ? [{ phoneHash }] : []),
      ],
    });

    if (!targetUser) {
      // No account found — create a placeholder; omit absent fields so null
      // doesn't collide with the partial unique index
      const placeholderData = {
        name: (name && name.trim()) || email || phone || 'Invited',
        isPlaceholder: true,
      };
      if (email) {
        placeholderData.email = email.toLowerCase().trim();
        placeholderData.emailHash = emailHash;
      }
      if (phone) {
        placeholderData.phone = phone.trim();
        placeholderData.phoneHash = phoneHash;
      }
      targetUser = await User.create(placeholderData);
    }
  }

  if (group.members.some(m => m.toString() === targetUser._id.toString())) {
    return res.status(409).json({ message: 'Already a member' });
  }

  group.members.push(targetUser._id);
  await group.save();

  await logActivity({
    type: 'member_added',
    actor: req.user,
    group,
    metadata: { targetName: targetUser.name, targetId: targetUser._id },
  });

  res.status(200).json({
    message: 'Member added successfully',
    groupId: group._id,
    memberId: targetUser._id,
    name: targetUser.name,
    isPlaceholder: targetUser.isPlaceholder,
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

  // If leaving member was admin, clear adminId
  if (group.adminId?.toString() === req.user._id.toString()) {
    group.adminId = null;
  }

  // If last member left, delete the group entirely
  if (group.members.length === 0) {
    await Expense.deleteMany({ group: group._id });
    await Activity.deleteMany({ group: group._id });
    await group.deleteOne();
    return res.json({ message: 'Group deleted as last member left' });
  }

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

      const memberIds = group.members.map(m => m.toString());

      const preview = buildPreview(group.balanceMode ?? 'pairwise', {
        userId,
        balancesCents: balances,
        memberIds,
        expenses,
        nameMap,
      });

      const netDollars = myNet / 100;
      let status = 'settled';
      if (netDollars > 0) status = 'you_are_owed';
      if (netDollars < 0) status = 'you_owe';

      summaries.push({
        _id: group._id,
        name: group.name,
        emoji: group.emoji ?? '🏠',
        defaultSplitType: group.defaultSplitType ?? 'equal',
        balanceMode: group.balanceMode ?? 'pairwise',
        createdBy: group.createdBy.toString(),
        adminId: group.adminId?.toString() ?? null,
        balance: { net: netDollars, status },
        preview: preview,
        othersCount: 0,
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
    const group = await Group.findById(groupId).populate('members', 'name email isPlaceholder');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: 'Not authorized' });

    res.status(200).json({
      members: group.members.map((m) => ({
        id: m._id,
        name: m.name,
        email: m.email,
        isPlaceholder: m.isPlaceholder ?? false,
      })),
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
      .populate('members', 'name email isPlaceholder')
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
      adminId: group.adminId?.toString() ?? null,
      members: group.members.map((m) => ({
        id: m._id,
        name: m.name,
        email: m.email,
        isPlaceholder: m.isPlaceholder ?? false,
      })),
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

// ── Update balance mode ───────────────────────────────────────────────────────
export const updateBalanceMode = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { balanceMode } = req.body;

    if (!['simplified', 'pairwise'].includes(balanceMode)) {
      return res.status(400).json({ message: 'Invalid balance mode' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (group.adminId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group admin can change balance mode' });
    }

    group.balanceMode = balanceMode;
    await group.save();

    res.json({ message: 'Balance mode updated', balanceMode });
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

    const isAdmin = group.adminId?.toString() === req.user._id.toString();
    const isSelf = memberId === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'You can only remove yourself from the group' });
    }

    const isMember = group.members.some((m) => m.toString() === memberId);
    if (!isMember) return res.status(404).json({ message: 'Member not found in group' });

    const expenses = await Expense.find({ group: groupId });
    const balances = calculateGroupBalances(group, expenses);

    if (isAdmin && !isSelf) {
      // Admin removing another member — check their balance
      const memberBalance = balances[memberId] ?? 0;
      if (memberBalance !== 0) {
        return res.status(400).json({
          message: 'Member has unsettled balances and cannot be removed',
          balance: memberBalance / 100,
        });
      }
    }

    if (isSelf) {
      // Member removing themselves — check own balance
      const memberBalance = balances[memberId] ?? 0;
      if (memberBalance !== 0) {
        return res.status(400).json({
          message: 'Member has unsettled balances and cannot be removed',
          balance: memberBalance / 100,
        });
      }
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

    if (group.adminId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the group admin can delete the group' });
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