import mongoose from 'mongoose';

const pendingFriendSchema = new mongoose.Schema(
  {
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      default: null,
    },
    phoneHash: {
      type: String,
      default: null,
      index: true,
    },
    emailHash: {
      type: String,
      default: null,
      index: true,
    },
    inviteToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['pending'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model('PendingFriend', pendingFriendSchema);
