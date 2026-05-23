import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hashContact } from '../utils/hash.helper.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    default: null,
  },
  phone: {
    type: String,
    sparse: true,
    unique: true,
    trim: true,
    default: null,
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  phoneOtp: {
    type: String,
    default: null,
  },
  phoneOtpExpiry: {
    type: Date,
    default: null,
  },
  phoneOtpResendCount: {
    type: Number,
    default: 0,
  },
  phoneOtpBlockedUntil: {
    type: Date,
    default: null,
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  friends: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  emailHash: {
    type: String,
    sparse: true,
    index: true,
    default: null,
  },
  phoneHash: {
    type: String,
    sparse: true,
    index: true,
    default: null,
  },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String, select: false },
  verificationTokenExpiry: { type: Date, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetTokenExpiry: { type: Date, select: false },
}, { timestamps: true });

/* Hash password before saving */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.generateVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = token;
  this.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return token;
};

userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = token;
  this.passwordResetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token;
};

userSchema.pre('save', async function () {
  if (this.isModified('email') && this.email) {
    this.emailHash = hashContact(this.email);
  }
  if (this.isModified('phone') && this.phone) {
    this.phoneHash = hashContact(this.phone);
  }
});

const User = mongoose.model('User', userSchema);
export default User;