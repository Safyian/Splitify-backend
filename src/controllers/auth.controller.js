import User from '../models/user.js';
import bcrypt from 'bcryptjs';
import Group from '../models/group.js';
import Expense from '../models/expense.js';
import { calculateGroupBalances } from '../utils/balance.js';
import { generateToken } from '../utils/token.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.helper.js';
import { sendOtp, generateOtp } from '../utils/sms.helper.js';
import { linkPendingFriends } from './friends.controller.js';

/* ================================
   REGISTER
================================ */

export const register = async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters' });
  }
  if (!email && !phone) {
    return res.status(400).json({ message: 'Email or phone number is required' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }
  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
    return res.status(400).json({ message: 'Password must contain letters and numbers' });
  }

  const existingUser = await User.findOne({
    $or: [
      ...(email ? [{ email: email.toLowerCase().trim() }] : []),
      ...(phone ? [{ phone: phone.trim() }] : []),
    ],
  });
  if (existingUser) {
    return res.status(400).json({
      message:
        existingUser.email === email?.toLowerCase().trim()
          ? 'An account with this email already exists'
          : 'An account with this phone number already exists',
    });
  }

  const user = new User({
    name: name.trim(),
    password,
    ...(email ? { email: email.toLowerCase().trim() } : {}),
    ...(phone ? { phone: phone.trim() } : {}),
  });

  if (phone) {
    const otp = generateOtp();
    user.phoneOtp = otp;
    user.phoneOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneOtpResendCount = 1;
    await user.save();
    await sendOtp(phone.trim(), otp);
    return res.status(201).json({
      message: 'OTP sent to your phone number',
      requiresPhoneVerification: true,
      userId: user._id,
    });
  }

  // Email flow
  const token = user.generateVerificationToken();
  await user.save();

  const verificationUrl = `${process.env.APP_URL}/auth/verify/${token}`;
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
  const { token } = req.params;

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpiry: { $gt: new Date() },
  }).select('+verificationToken +verificationTokenExpiry');

  // ── Failed — invalid or expired token ───────────────────────────────────
  if (!user) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Verification Failed — Splitify</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            background: #F2F1F8;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            background: white;
            border-radius: 24px;
            padding: 48px 36px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06);
          }
          .icon {
            width: 72px;
            height: 72px;
            background: rgba(229, 109, 57, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 32px;
          }
          h1 {
            font-size: 22px;
            font-weight: 700;
            color: #1C1C1E;
            margin-bottom: 10px;
          }
          p {
            font-size: 15px;
            color: #6B6B6B;
            line-height: 1.6;
            margin-bottom: 28px;
          }
          .btn {
            display: inline-block;
            background: #E56D39;
            color: white;
            font-size: 15px;
            font-weight: 600;
            padding: 14px 28px;
            border-radius: 12px;
            text-decoration: none;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">⚠️</div>
          <h1>Link expired or invalid</h1>
          <p>
            This verification link has expired or has already been used.
            Open the Splitify app and request a new verification email.
          </p>
          <a href="splitify://resend-verification" class="btn">
            Open Splitify
          </a>
        </div>
      </body>
      </html>
    `);
  }

  // ── Success — activate account ───────────────────────────────────────────
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();
  await linkPendingFriends(user);

  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Email Verified — Splitify</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          background: #F2F1F8;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .card {
          background: white;
          border-radius: 24px;
          padding: 48px 36px;
          max-width: 420px;
          width: 100%;
          text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
        .icon {
          width: 72px;
          height: 72px;
          background: rgba(13, 173, 133, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 32px;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          color: #1C1C1E;
          margin-bottom: 10px;
        }
        p {
          font-size: 15px;
          color: #6B6B6B;
          line-height: 1.6;
          margin-bottom: 28px;
        }
        .btn {
          display: inline-block;
          background: #0DAD85;
          color: white;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 12px;
          text-decoration: none;
          width: 100%;
        }
        .hint {
          font-size: 13px;
          color: #9B9B9B;
          margin-top: 20px;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Email verified!</h1>
        <p>
          Your Splitify account is now active.
          Open the app and sign in to start splitting expenses.
        </p>
        <a href="splitify://login" class="btn">
          Open Splitify
        </a>
        <p class="hint">
          If the button doesn't work, open the Splitify app manually and sign in.
        </p>
      </div>
    </body>
    </html>
  `);
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

  const verificationUrl = `${process.env.APP_URL}/auth/verify/${token}`;
  await sendVerificationEmail({ to: user.email, name: user.name, verificationUrl });

  res.status(200).json({ message: 'Verification email resent. Please check your inbox.' });
};

/* ================================
   SEND PHONE OTP
================================ */

export const sendPhoneOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) return res.status(404).json({ message: 'No account found with this phone number' });

    if (user.isPhoneVerified) {
      return res.status(400).json({ message: 'Phone number already verified' });
    }

    if (user.phoneOtpBlockedUntil && user.phoneOtpBlockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.phoneOtpBlockedUntil - new Date()) / 60000);
      return res.status(429).json({
        message: `Too many attempts. Try again in ${minutesLeft > 60 ? Math.ceil(minutesLeft / 60) + ' hours' : minutesLeft + ' minutes'}.`,
      });
    }

    if (user.phoneOtpResendCount >= 3) {
      const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      user.phoneOtpBlockedUntil = blockedUntil;
      await user.save();
      return res.status(429).json({
        message: 'Too many OTP requests. Your account is blocked for 24 hours.',
      });
    }

    const otp = generateOtp();
    user.phoneOtp = otp;
    user.phoneOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneOtpResendCount = (user.phoneOtpResendCount || 0) + 1;
    await user.save();

    await sendOtp(phone.trim(), otp);

    res.json({
      message: 'OTP sent successfully',
      remainingResends: 3 - user.phoneOtpResendCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   VERIFY PHONE OTP
================================ */

export const verifyPhoneOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isPhoneVerified) {
      return res.status(400).json({ message: 'Phone already verified' });
    }

    if (!user.phoneOtp || !user.phoneOtpExpiry) {
      return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    }

    if (user.phoneOtpExpiry < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (user.phoneOtp !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    user.isPhoneVerified = true;
    user.phoneOtp = null;
    user.phoneOtpExpiry = null;
    user.phoneOtpResendCount = 0;
    user.phoneOtpBlockedUntil = null;
    await user.save();
    await linkPendingFriends(user);

    res.json({
      message: 'Phone verified successfully',
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email ?? null,
        phone: user.phone,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   LOGIN WITH PHONE
================================ */

export const loginWithPhone = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone: phone.trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isPhoneVerified) {
      return res.status(401).json({
        message: 'Phone not verified',
        requiresPhoneVerification: true,
        userId: user._id,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email ?? null,
        phone: user.phone,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   CHECK CONTACTS
================================ */

export const checkContacts = async (req, res) => {
  try {
    const { emailHashes = [], phoneHashes = [] } = req.body;

    if (emailHashes.length === 0 && phoneHashes.length === 0) {
      return res.json({ registered: [] });
    }

    const emailHashesToCheck = emailHashes.slice(0, 500);
    const phoneHashesToCheck = phoneHashes.slice(0, 500);

    const users = await User.find({
      $or: [
        ...(emailHashesToCheck.length
          ? [{ emailHash: { $in: emailHashesToCheck } }]
          : []),
        ...(phoneHashesToCheck.length
          ? [{ phoneHash: { $in: phoneHashesToCheck } }]
          : []),
      ],
      _id: { $ne: req.user._id },
    }).select('name emailHash phoneHash');

    const registered = users.map(u => ({
      id: u._id,
      name: u.name,
      emailHash: u.emailHash ?? null,
      phoneHash: u.phoneHash ?? null,
    }));

    res.json({ registered });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   FORGOT PASSWORD — HELPERS
================================ */

const resetExpiredHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Link Expired — Splitify</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        background: #F2F1F8; min-height: 100vh;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .card {
        background: white; border-radius: 24px; padding: 48px 36px;
        max-width: 420px; width: 100%; text-align: center;
        box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      }
      .icon {
        width: 72px; height: 72px; background: rgba(229, 109, 57, 0.1);
        border-radius: 50%; display: flex; align-items: center;
        justify-content: center; margin: 0 auto 24px; font-size: 32px;
      }
      h1 { font-size: 22px; font-weight: 700; color: #1C1C1E; margin-bottom: 10px; }
      p  { font-size: 15px; color: #6B6B6B; line-height: 1.6; margin-bottom: 28px; }
      .btn {
        display: inline-block; background: #E56D39; color: white;
        font-size: 15px; font-weight: 600; padding: 14px 28px;
        border-radius: 12px; text-decoration: none; width: 100%;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">⚠️</div>
      <h1>Link expired or invalid</h1>
      <p>
        This password reset link has expired or has already been used.
        Open the Splitify app and request a new reset email.
      </p>
      <a href="splitify://forgot-password" class="btn">Open Splitify</a>
    </div>
  </body>
  </html>
`;

const buildResetFormHtml = (token, errorMessage = '') => {
  const errorBlock = errorMessage
    ? `<div class="error">${errorMessage}</div>`
    : '';
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Reset Password — Splitify</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          background: #F2F1F8; min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 24px;
        }
        .card {
          background: white; border-radius: 24px; padding: 48px 36px;
          max-width: 420px; width: 100%;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
        .icon {
          width: 72px; height: 72px; background: rgba(13, 173, 133, 0.1);
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; margin: 0 auto 24px; font-size: 32px;
        }
        h1 { font-size: 22px; font-weight: 700; color: #1C1C1E; margin-bottom: 10px; text-align: center; }
        p  { font-size: 15px; color: #6B6B6B; line-height: 1.6; margin-bottom: 28px; text-align: center; }
        label { display: block; font-size: 13px; font-weight: 600; color: #1C1C1E; margin-bottom: 6px; }
        input[type="password"] {
          width: 100%; padding: 14px 16px;
          border: 1.5px solid #E5E5EA; border-radius: 12px;
          font-size: 15px; font-family: inherit; margin-bottom: 16px;
          outline: none; transition: border-color 0.2s;
        }
        input[type="password"]:focus { border-color: #0DAD85; }
        .btn {
          display: block; width: 100%; background: #0DAD85; color: white;
          font-size: 15px; font-weight: 600; padding: 14px 28px;
          border-radius: 12px; border: none; cursor: pointer;
          font-family: inherit; margin-top: 8px;
        }
        .btn:hover { background: #0b9d78; }
        .error {
          background: rgba(229, 109, 57, 0.1); color: #E56D39;
          font-size: 13px; font-weight: 500; padding: 12px 16px;
          border-radius: 10px; margin-bottom: 16px;
        }
        .hint { font-size: 13px; color: #9B9B9B; line-height: 1.5; margin-top: 20px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🔒</div>
        <h1>Choose a new password</h1>
        <p>Must be at least 8 characters and contain a letter and a number.</p>
        ${errorBlock}
        <form method="POST" action="/auth/reset-password">
          <input type="hidden" name="token" value="${token}"/>
          <label for="password">New password</label>
          <input type="password" id="password" name="password" placeholder="New password" required/>
          <label for="confirmPassword">Confirm password</label>
          <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm password" required/>
          <button type="submit" class="btn">Reset Password</button>
        </form>
        <p class="hint">This link expires 1 hour after it was sent.</p>
      </div>
    </body>
    </html>
  `;
};

/* ================================
   FORGOT PASSWORD
================================ */

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const normalisedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalisedEmail })
    .select('+passwordResetToken +passwordResetTokenExpiry');

  // Always return 200 — prevents email enumeration
  if (!user) {
    return res.status(200).json({
      message: 'If that email exists, a password reset link has been sent.',
    });
  }

  const token = user.generatePasswordResetToken();
  await user.save();

  const resetUrl = `${process.env.APP_URL}/auth/reset-password?token=${token}`;
  await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

  return res.status(200).json({
    message: 'If that email exists, a password reset link has been sent.',
  });
};

/* ================================
   SHOW RESET FORM (GET)
================================ */

export const showResetForm = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(resetExpiredHtml);
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetTokenExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetTokenExpiry');

  if (!user) {
    return res.status(400).send(resetExpiredHtml);
  }

  return res.status(200).send(buildResetFormHtml(token));
};

/* ================================
   RESET PASSWORD (POST — form submit)
================================ */

export const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    res.status(400);
    throw new Error('All fields are required');
  }

  if (password !== confirmPassword) {
    return res.status(400).send(buildResetFormHtml(token, 'Passwords do not match.'));
  }

  const strongEnough =
    password.length >= 8 && /(?=.*[a-zA-Z])(?=.*[0-9])/.test(password);
  if (!strongEnough) {
    return res.status(400).send(
      buildResetFormHtml(token, 'Password must be at least 8 characters and contain a letter and a number.')
    );
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetTokenExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetTokenExpiry +password');

  if (!user) {
    return res.status(400).send(resetExpiredHtml);
  }

  // pre('save') bcrypt hook runs automatically when password is modified
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpiry = undefined;
  await user.save();

  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Password Reset — Splitify</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          background: #F2F1F8; min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 24px;
        }
        .card {
          background: white; border-radius: 24px; padding: 48px 36px;
          max-width: 420px; width: 100%; text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
        .icon {
          width: 72px; height: 72px; background: rgba(13, 173, 133, 0.1);
          border-radius: 50%; display: flex; align-items: center;
          justify-content: center; margin: 0 auto 24px; font-size: 32px;
        }
        h1 { font-size: 22px; font-weight: 700; color: #1C1C1E; margin-bottom: 10px; }
        p  { font-size: 15px; color: #6B6B6B; line-height: 1.6; margin-bottom: 28px; }
        .btn {
          display: inline-block; background: #0DAD85; color: white;
          font-size: 15px; font-weight: 600; padding: 14px 28px;
          border-radius: 12px; text-decoration: none; width: 100%;
        }
        .hint { font-size: 13px; color: #9B9B9B; margin-top: 20px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Password updated!</h1>
        <p>Your Splitify password has been changed. Open the app and sign in with your new password.</p>
        <a href="splitify://login" class="btn">Open Splitify</a>
        <p class="hint">If the button doesn't open the app, launch Splitify manually and sign in.</p>
      </div>
    </body>
    </html>
  `);
};