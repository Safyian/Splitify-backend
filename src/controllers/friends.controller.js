import User from "../models/user.js";
import Group from "../models/group.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances, simplifyDebts, calculatePairwiseDebts } from '../utils/balance.js';
import PendingFriend from '../models/pending_friend.js';
import { hashContact } from '../utils/hash.helper.js';
import crypto from 'crypto';

// ── GET /api/friends ──────────────────────────────────────────────────────────
// Returns explicit friends + group contacts, each with cross-group balance
export const getFriends = async (req, res) => {
  try {
    const myId = req.user._id.toString();

    // 1. Fetch explicit friends
    const me = await User.findById(myId).populate("friends", "name email");
    const explicitFriendIds = new Set(
      me.friends.map(f => f._id.toString())
    );

    // 2. Find all groups the user is in
    const groups = await Group.find({ members: myId });

    // 3. Collect all unique group-mate IDs (excluding self)
    const groupMateIds = new Set();
    for (const group of groups) {
      group.members.forEach(memberId => {
        const id = memberId.toString();
        if (id !== myId) groupMateIds.add(id);
      });
    }

    // 4. Fetch group-mate user details
    const groupMateUsers = await User.find({
      _id: { $in: [...groupMateIds] }
    }).select("name email");

    // 5. Build a map of userId → { name, email }
    const userMap = {};
    me.friends.forEach(f => {
      userMap[f._id.toString()] = { name: f.name, email: f.email };
    });
    groupMateUsers.forEach(u => {
      userMap[u._id.toString()] = { name: u.name, email: u.email };
    });

    // 6. Compute cross-group net balance per person
    //    net > 0 means they owe me, net < 0 means I owe them
    const netBalances = {}; // userId → net in dollars

    for (const group of groups) {
      const expenses = await Expense.find({ group: group._id });
      const balancesCents = calculateGroupBalances(group, expenses);
      const balanceMode = group.balanceMode ?? 'pairwise';
      const memberIds = group.members.map(m => m.toString());

      let debts = [];

      if (balanceMode === 'pairwise') {
        debts = calculatePairwiseDebts(memberIds, expenses)
          .map(({ from, to, amount }) => ({ from, to, amount }));
      } else {
        debts = simplifyDebts({ ...balancesCents })
          .map(({ from, to, amount }) => ({ from, to, amount }));
      }

      debts.forEach(({ from, to, amount }) => {
        if (from === myId) {
          netBalances[to] = (netBalances[to] ?? 0) - amount;
        } else if (to === myId) {
          netBalances[from] = (netBalances[from] ?? 0) + amount;
        }
      });
    }

    // 7. Build combined list — all unique people (friends + group mates)
    const allIds = new Set([...explicitFriendIds, ...groupMateIds]);

    const contacts = [...allIds].map(uid => {
      const user = userMap[uid];
      if (!user) return null;

      const net = parseFloat((netBalances[uid] ?? 0).toFixed(2));
      const isExplicitFriend = explicitFriendIds.has(uid);
      const isGroupContact = groupMateIds.has(uid);

      let balanceStatus = "settled";
      if (net > 0) balanceStatus = "you_are_owed";
      if (net < 0) balanceStatus = "you_owe";

      return {
        id: uid,
        name: user.name,
        email: user.email,
        isExplicitFriend,
        isGroupContact,
        balance: {
          net,
          status: balanceStatus
        }
      };
    }).filter(Boolean);

    // Sort: unsettled first, then alphabetically
    contacts.sort((a, b) => {
      const aSettled = a.balance.status === "settled";
      const bSettled = b.balance.status === "settled";
      if (aSettled !== bSettled) return aSettled ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    // Fetch pending friends invited by this user
    const pendingFriends = await PendingFriend.find({ invitedBy: myId });

    const pendingContacts = pendingFriends.map(p => ({
      id: p._id,
      name: p.name,
      email: p.email ?? null,
      phone: p.phone ?? null,
      isExplicitFriend: false,
      isGroupContact: false,
      isPending: true,
      balance: { net: 0, status: 'settled' },
    }));

    const activeContacts = contacts.map(c => ({ ...c, isPending: false }));

    res.json([...activeContacts, ...pendingContacts]);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/friends ─────────────────────────────────────────────────────────
// Add a friend by email
export const addFriend = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Can't add yourself
    if (email === req.user.email) {
      return res.status(400).json({ message: "You cannot add yourself as a friend" });
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({ message: "No Splitify account found with that email" });
    }

    const me = await User.findById(req.user._id);

    // Already a friend
    if (me.friends.some(f => f.toString() === userToAdd._id.toString())) {
      return res.status(400).json({ message: "Already in your friends list" });
    }

    me.friends.push(userToAdd._id);
    await me.save();

    res.status(201).json({
      message: "Friend added successfully",
      friend: {
        id: userToAdd._id,
        name: userToAdd.name,
        email: userToAdd.email
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/friends/:friendId ─────────────────────────────────────────────
// Remove an explicit friend
export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;

    const me = await User.findById(req.user._id);

    const exists = me.friends.some(f => f.toString() === friendId);
    if (!exists) {
      return res.status(404).json({ message: "Friend not found in your list" });
    }

    me.friends = me.friends.filter(f => f.toString() !== friendId);
    await me.save();

    res.json({ message: "Friend removed successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/friends/invite ──────────────────────────────────────────────────
// Invite a contact who is not yet on Splitify
export const inviteFriend = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const myId = req.user._id.toString();

    if (!name || (!phone && !email)) {
      return res.status(400).json({
        message: 'Name and phone or email are required',
      });
    }

    const phoneHash = phone ? hashContact(phone) : null;
    const emailHash = email ? hashContact(email.toLowerCase().trim()) : null;

    // Check if already registered
    const existingUser = await User.findOne({
      $or: [
        ...(phoneHash ? [{ phoneHash }] : []),
        ...(emailHash ? [{ emailHash }] : []),
      ],
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'This person is already on Splittify. Add them as a friend instead.',
        isRegistered: true,
        userId: existingUser._id,
        name: existingUser.name,
      });
    }

    // Check if already invited by this user
    const existing = await PendingFriend.findOne({
      invitedBy: myId,
      $or: [
        ...(phoneHash ? [{ phoneHash }] : []),
        ...(emailHash ? [{ emailHash }] : []),
      ],
    });

    if (existing) {
      return res.status(400).json({
        message: `You've already invited ${name}`,
      });
    }

    const inviteToken = crypto.randomBytes(16).toString('hex');

    const pending = await PendingFriend.create({
      invitedBy: myId,
      name: name.trim(),
      phone: phone ?? null,
      email: email ? email.toLowerCase().trim() : null,
      phoneHash,
      emailHash,
      inviteToken,
    });

    res.status(201).json({
      message: 'Invitation created',
      pending: {
        id: pending._id,
        name: pending.name,
        phone: pending.phone,
        email: pending.email,
        status: 'pending',
        inviteToken: pending.inviteToken,
        createdAt: pending.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Called on registration to auto-link pending invites ───────────────────────
export const linkPendingFriends = async (newUser) => {
  try {
    const phoneHash = newUser.phoneHash;
    const emailHash = newUser.emailHash;

    const pendingRecords = await PendingFriend.find({
      $or: [
        ...(phoneHash ? [{ phoneHash }] : []),
        ...(emailHash ? [{ emailHash }] : []),
      ],
    });

    for (const pending of pendingRecords) {
      const inviter = await User.findById(pending.invitedBy);
      if (!inviter) continue;

      if (!inviter.friends.includes(newUser._id)) {
        inviter.friends.push(newUser._id);
        await inviter.save();
      }
      if (!newUser.friends.includes(inviter._id)) {
        newUser.friends.push(inviter._id);
        await newUser.save();
      }

      await pending.deleteOne();
    }
  } catch (err) {
    console.error('linkPendingFriends error:', err);
  }
};