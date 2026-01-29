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

