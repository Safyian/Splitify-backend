// Add at top of balance.js
const toId = (user) =>
  user?._id ? user._id.toString() : user.toString();

// Calculate net balances for each member in a group based on expenses
export const calculateGroupBalances = (group, expenses) => {
  const balances = {};

  group.members.forEach(member => {
    balances[member.toString()] = 0;
  });

  expenses.forEach(expense => {
    const paidBy = toId(expense.paidBy); // ✅
    const amountCents = Math.round(expense.amount * 100);
    balances[paidBy] += amountCents;

    expense.splits.forEach(split => {
      const user = toId(split.user); // ✅
      const shareCents = Math.round(split.amount * 100);
      balances[user] -= shareCents;
    });
  });

  return balances;
};

// Simplify debts among users based on their net balances
export const simplifyDebts = (balancesCents) => {
  const debtors = [];
  const creditors = [];

  for (const user in balancesCents) {
    const bal = balancesCents[user];
    if (bal < 0) debtors.push({ user, amount: -bal });
    if (bal > 0) creditors.push({ user, amount: bal });
  }

  // Sort largest first for consistent, optimal simplification
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const payAmount = Math.min(debtors[d].amount, creditors[c].amount);

    settlements.push({
      from: debtors[d].user,
      to: creditors[c].user,
      amount: payAmount / 100
    });

    debtors[d].amount -= payAmount;
    creditors[c].amount -= payAmount;

    if (debtors[d].amount < 1) d++; // ✅
    if (creditors[c].amount < 1) c++; // ✅
  }

  return settlements;
};
