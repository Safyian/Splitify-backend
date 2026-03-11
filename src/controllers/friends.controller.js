import User from "../models/user.js";
import Group from "../models/group.js";
import Expense from "../models/expense.js";
import { calculateGroupBalances } from "../utils/balance.js";

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
      const balances = calculateGroupBalances(group, expenses);

      const myNet = balances[myId] ?? 0;

      Object.entries(balances).forEach(([uid, net]) => {
        if (uid === myId) return;

        // Derive pairwise amount between me and this person
        const pairwise = Math.min(Math.abs(myNet), Math.abs(net));
        if (pairwise === 0) return;

        let contribution = 0;
        if (myNet > 0 && net < 0) contribution = pairwise / 100;   // they owe me
        if (myNet < 0 && net > 0) contribution = -(pairwise / 100); // I owe them

        netBalances[uid] = (netBalances[uid] ?? 0) + contribution;
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