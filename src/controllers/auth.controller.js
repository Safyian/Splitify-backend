import User from '../models/user.js';
import bcrypt from 'bcryptjs';

import { generateToken } from '../utils/token.js';

/* ================================
   REGISTER
================================ */

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    name,
    email,
    password
  });

  res.status(201).json({
  token: generateToken(user._id),
  user: {
    id: user._id,
    name: user.name,
    email: user.email
  }
});

};

/* ================================
   LOGIN
================================ */

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

   res.status(201).json({
  token: generateToken(user._id),
  user: {
    id: user._id,
    name: user.name,
    email: user.email
  }
});
};

/* ================================
   LOGOUT
================================ */

export const logout = async (req, res) => {
  // No server-side logout for JWT
  res.status(200).json({
    message: "Logged out successfully"
  });
};

// ===============================
// GET CURRENT USER
// ===============================  
export const getMe = async (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name
    }
  });
};

// PATCH /api/auth/me  — update display name
export const updateMe = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Name is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name: name.trim() },
      { new: true }
    ).select('id name email');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      valid: true,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/auth/me  — delete account
export const deleteMe = async (req, res) => {
  try {
    const userId = req.user._id;

    // Safety check — must have no unsettled balances across all groups
    const groups = await Group.find({ members: userId });

    for (const group of groups) {
      const expenses = await Expense.find({ group: group._id });
      const balances = calculateGroupBalances(group, expenses);
      const myBalance = balances[userId.toString()] ?? 0;

      if (myBalance !== 0) {
        return res.status(400).json({
          message: `You have unsettled balances in "${group.name}". Please settle before deleting your account.`,
        });
      }

      // Remove user from group
      group.members = group.members.filter(
        (m) => m.toString() !== userId.toString()
      );
      await group.save();
    }

    // Delete groups they created that are now empty
    await Group.deleteMany({ createdBy: userId, members: { $size: 0 } });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};