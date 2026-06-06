import User from "../models/user.js";
import Group from "../models/group.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances, simplifyDebts, calculatePairwiseDebts } from '../utils/balance.js';
import { hashContact } from '../utils/hash.helper.js';

// ── GET /api/friends ──────────────────────────────────────────────────────────
// Returns explicit friends + group contacts, each with cross-group balance
export const getFriends = async (req, res) => {
  try {
    const myId = req.user._id.toString();

    // 1. Fetch explicit friends (include phone + isPlaceholder for badge/display)
    const me = await User.findById(myId).populate("friends", "name email phone isPlaceholder");
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
    }).select("name email phone isPlaceholder");

    // 5. Build a map of userId → { name, email, phone, isPlaceholder }
    const userMap = {};
    me.friends.forEach(f => {
      userMap[f._id.toString()] = { name: f.name, email: f.email, phone: f.phone ?? null, isPlaceholder: f.isPlaceholder ?? false };
    });
    groupMateUsers.forEach(u => {
      userMap[u._id.toString()] = { name: u.name, email: u.email, phone: u.phone ?? null, isPlaceholder: u.isPlaceholder ?? false };
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
        phone: user.phone,
        isPlaceholder: user.isPlaceholder,
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

    res.json(contacts);

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

    const userToAdd = await User.findOne({ email, isPlaceholder: { $ne: true } });
    if (!userToAdd) {
      return res.status(404).json({ message: "No Splitify account found with that email" });
    }

    const me = await User.findById(req.user._id);

    // Already a friend
    if (me.friends.some(f => f.toString() === userToAdd._id.toString())) {
      return res.status(400).json({ message: "Already in your friends list" });
    }

    // Bidirectional friendship
    me.friends.push(userToAdd._id);
    if (!userToAdd.friends.some(f => f.toString() === req.user._id.toString())) {
      userToAdd.friends.push(req.user._id);
    }
    await me.save();
    await userToAdd.save();

    res.status(201).json({
      message: "Friend added successfully",
      friend: {
        id: userToAdd._id,
        name: userToAdd.name,
        email: userToAdd.email ?? null,
        phone: userToAdd.phone ?? null,
        isPlaceholder: false,
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/friends/add-by-id ───────────────────────────────────────────────
// Add a friend by user ID (used after checkContacts finds a registered user)
export const addFriendById = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Can't add yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot add yourself as a friend' });
    }

    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
      return res.status(404).json({ message: 'User not found' });
    }

    const me = await User.findById(req.user._id);

    // Already a friend
    if (me.friends.some(f => f.toString() === userId)) {
      return res.status(400).json({ message: 'Already in your friends list' });
    }

    // Bidirectional friendship
    me.friends.push(userToAdd._id);
    if (!userToAdd.friends.some(f => f.toString() === req.user._id.toString())) {
      userToAdd.friends.push(req.user._id);
    }
    await me.save();
    await userToAdd.save();

    res.status(201).json({
      message: 'Friend added successfully',
      friend: {
        id: userToAdd._id,
        name: userToAdd.name,
        email: userToAdd.email ?? null,
        phone: userToAdd.phone ?? null,
        isPlaceholder: userToAdd.isPlaceholder ?? false,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/friends/:friendId ─────────────────────────────────────────────
// Remove an explicit friend (bidirectional). Cleans up orphaned placeholders.
export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;
    const myId = req.user._id.toString();

    const me = await User.findById(myId);
    const exists = me.friends.some(f => f.toString() === friendId);
    if (!exists) {
      return res.status(404).json({ message: "Friend not found in your list" });
    }

    // Remove from both sides
    me.friends = me.friends.filter(f => f.toString() !== friendId);
    await me.save();

    const friend = await User.findById(friendId);
    if (friend) {
      friend.friends = friend.friends.filter(f => f.toString() !== myId);
      await friend.save();

      // If the removed friend is a placeholder, delete it only when unreferenced
      if (friend.isPlaceholder) {
        const inGroup    = await Group.exists({ members: friendId });
        const inFriends  = await User.exists({ friends: friendId });
        const inExpense  = await Expense.exists({ 'splits.user': friendId });
        if (!inGroup && !inFriends && !inExpense) {
          await User.deleteOne({ _id: friendId });
        }
      }
    }

    res.json({ message: "Friend removed successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/friends/invite ──────────────────────────────────────────────────
// Invite an unregistered contact — creates/reuses a placeholder User, links bidirectionally
export const inviteFriend = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const myId = req.user._id;

    if (!name || (!phone && !email)) {
      return res.status(400).json({
        message: 'Name and phone or email are required',
      });
    }

    const emailHash = email ? hashContact(email.toLowerCase().trim()) : null;
    const phoneHash = phone ? hashContact(phone.trim()) : null;

    // Look for any existing user or placeholder by hash
    let target = await User.findOne({
      $or: [
        ...(emailHash ? [{ emailHash }] : []),
        ...(phoneHash ? [{ phoneHash }] : []),
      ],
    });

    if (target && !target.isPlaceholder) {
      // Already a real registered user — tell client to use addFriendById instead
      return res.status(400).json({
        message: 'This person is already on Splitify. Add them as a friend instead.',
        isRegistered: true,
        userId: target._id,
        name: target.name,
      });
    }

    const me = await User.findById(myId);

    if (!target) {
      // No record at all — create a placeholder (omit absent fields, never set null)
      const data = { name: name.trim(), isPlaceholder: true };
      if (email) { data.email = email.toLowerCase().trim(); data.emailHash = emailHash; }
      if (phone) { data.phone = phone.trim(); data.phoneHash = phoneHash; }
      target = await User.create(data);
    }

    // Already in friends list?
    if (me.friends.some(f => f.toString() === target._id.toString())) {
      return res.status(409).json({
        message: 'Already in your friends list',
        friend: { id: target._id, name: target.name, isPlaceholder: target.isPlaceholder },
      });
    }

    // Bidirectional friendship so promotion needs no extra linking step
    me.friends.push(target._id);
    if (!target.friends.some(f => f.toString() === myId.toString())) {
      target.friends.push(myId);
    }
    await me.save();
    await target.save();

    res.status(201).json({
      message: 'Invitation created',
      friend: {
        id: target._id,
        name: target.name,
        email: target.email ?? null,
        phone: target.phone ?? null,
        isPlaceholder: true,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

