import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'expense_added',
        'expense_updated',
        'settlement_made',
        'member_added',
        'member_removed',
        'group_created',
        'group_renamed',
        'group_left',
        'group_deleted',
      ],
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    // Flexible metadata — store what's needed per event type
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Denormalised for fast reads — no populate needed
    actorName: { type: String },
    groupName: { type: String },
  },
  { timestamps: true }
);

// Index for fast per-user feed queries
activitySchema.index({ group: 1, createdAt: -1 });

export default mongoose.model('Activity', activitySchema);