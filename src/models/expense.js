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
        }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);
