import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true
    },

    description: {
      type: String,
      trim: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    splitType: {
      type: String,
      enum: ["equal", "exact", "percentage"],
      required: true,
      default: "equal"
    },

    splits: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        amount: {
          type: Number,
          required: true
        },
        percentage: {
          type: Number,
          default: null  // only set for percentage split type
        }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);
