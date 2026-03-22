import User from '../models/user.js';
import bcrypt from 'bcryptjs';
import Group from '../models/group.js';
import Expense from '../models/expense.js';
import { calculateGroupBalances } from '../utils/balance.js';
import { generateToken } from '../utils/token.js';
import { sendVerificationEmail } from '../utils/email.helper.js';

/* ================================
   REGISTER
================================ */

export const register = async (req, res) => {
  const { name, email, password } = req.body;
  const normalisedEmail = email.toLowerCase().trim();

  const userExists = await User.findOne({ email: normalisedEmail });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    name,
    email: normalisedEmail,
    password
  });

  const token = user.generateVerificationToken();
  await user.save();

  const verificationUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;
  await sendVerificationEmail({ to: user.email, name: user.name, verificationUrl });

  res.status(201).json({
    message: 'Account created. Please check your email to verify your account.',
    email: user.email,
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

  if (!user.isVerified) {
    res.status(403);
    throw new Error('Please verify your email before logging in.');
  }

  res.status(200).json({
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

/* ================================
   VERIFY EMAIL
================================ */

export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    res.status(400);
    throw new Error('Verification token is required');
  }

  const user = await User.findOne({ verificationToken: token })
    .select('+verificationToken +verificationTokenExpiry');

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired verification token');
  }

  if (user.verificationTokenExpiry < new Date()) {
    res.status(400);
    throw new Error('Verification token has expired. Please request a new one.');
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
};

/* ================================
   RESEND VERIFICATION EMAIL
================================ */

export const resendVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+verificationToken +verificationTokenExpiry');

  if (!user) {
    // Return success to prevent email enumeration
    return res.status(200).json({ message: 'If that email exists, a verification link has been sent.' });
  }

  if (user.isVerified) {
    res.status(400);
    throw new Error('This account is already verified.');
  }

  const token = user.generateVerificationToken();
  await user.save();

  const verificationUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;
  await sendVerificationEmail({ to: user.email, name: user.name, verificationUrl });

  res.status(200).json({ message: 'Verification email resent. Please check your inbox.' });
};