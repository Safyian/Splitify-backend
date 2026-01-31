export const validateExpenseInput = ({
  description,
  amount,
  splitType,
  splits
}) => {

  if (!description || !amount || amount <= 0) {
    throw new Error("Invalid expense data");
  }

  if (!["equal","percentage", "exact"].includes(splitType)) {
    throw new Error("Invalid split type");
  }

  if (!splits || splits.length === 0) {
    throw new Error("Splits required");
  }
};

export const validateGroupMembers = (group, paidBy, splits) => {

  if (!group.members.includes(paidBy)) {
    throw new Error("Payer must be group member");
  }

  const seen = new Set();

  for (const s of splits) {

    if (!group.members.includes(s.user)) {
      throw new Error("Split users must be group members");
    }

    if (seen.has(s.user.toString())) {
      throw new Error("Duplicate split user");
    }

    seen.add(s.user.toString());
  }
};

export const validatePercentages = (splits) => {
  let total = 0;

  for (const s of splits) {
    if (s.percentage == null || s.percentage <= 0) {
      throw new Error("Invalid percentage");
    }
    total += s.percentage;
  }

  if (Math.abs(total - 100) > 0.001) {
    throw new Error("Percentages must total 100");
  }
};

// Exact amount splits validation
export const validateExactSplits = (splits) => {
  for (const s of splits) {
    if (s.amount == null || s.amount <= 0) {
      throw new Error("Each split needs valid amount");
    }
  }
};
