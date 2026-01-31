// Calculate net balances for each member in a group based on expenses
export const calculateGroupBalances = (group, expenses) => {

  // 1️⃣ Init balances in cents
  const balances = {};

  group.members.forEach(member => {
    balances[member.toString()] = 0;
  });

  // 2️⃣ Process each expense
  expenses.forEach(expense => {

    const paidBy = expense.paidBy.toString();
    const amountCents = Math.round(expense.amount * 100);

    // Add full payment to payer
    balances[paidBy] += amountCents;

    // Subtract each user's share
    expense.splits.forEach(split => {
      const user = split.user.toString();
      const shareCents = Math.round(split.amount * 100);

      balances[user] -= shareCents;
    });
  });

  return balances; // cents
};

// Simplify debts among users based on their net balances
export const simplifyDebts = (balancesCents) => {

  const debtors = [];
  const creditors = [];

  for (const user in balancesCents) {
    const bal = balancesCents[user];

    if (bal < 0) {
      debtors.push({ user, amount: -bal });
    }

    if (bal > 0) {
      creditors.push({ user, amount: bal });
    }
  }

  const settlements = [];

  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {

    const payAmount = Math.min(
      debtors[d].amount,
      creditors[c].amount
    );

    settlements.push({
      from: debtors[d].user,
      to: creditors[c].user,
      amount: payAmount / 100 // convert for response
    });

    debtors[d].amount -= payAmount;
    creditors[c].amount -= payAmount;

    if (debtors[d].amount === 0) d++;
    if (creditors[c].amount === 0) c++;
  }

  return settlements;
};
