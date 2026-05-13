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

export const calculatePairwiseDebts = (memberIds, expenses) => {
  const pairwise = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];

      let aOwesB = 0;
      let bOwesA = 0;

      expenses.forEach(expense => {
        const paidBy = expense.paidBy?._id
          ? expense.paidBy._id.toString()
          : expense.paidBy.toString();

        if (paidBy === b) {
          const aSplit = expense.splits.find(s => {
            const su = s.user?._id ? s.user._id.toString() : s.user.toString();
            return su === a;
          });
          if (aSplit) aOwesB += Math.round(aSplit.amount * 100);
        }

        if (paidBy === a) {
          const bSplit = expense.splits.find(s => {
            const su = s.user?._id ? s.user._id.toString() : s.user.toString();
            return su === b;
          });
          if (bSplit) bOwesA += Math.round(bSplit.amount * 100);
        }
      });

      const netCents = bOwesA - aOwesB;
      if (Math.abs(netCents) < 1) continue;

      pairwise.push(
        netCents > 0
          ? { from: b, to: a, amount: netCents / 100 }
          : { from: a, to: b, amount: Math.abs(netCents) / 100 }
      );
    }
  }

  return pairwise;
};

export const buildPreview = (strategy, { userId, balancesCents, memberIds, expenses, nameMap }) => {
  if (strategy === 'pairwise') {
    const pairwise = calculatePairwiseDebts(memberIds, expenses);
    return pairwise
      .filter(d => d.from === userId || d.to === userId)
      .map(d => ({
        userId: d.from === userId ? d.to : d.from,
        name: nameMap[d.from === userId ? d.to : d.from] || 'Someone',
        amount: d.amount,
        direction: d.to === userId ? 'you_receive' : 'you_pay',
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  // Default: simplified
  const simplified = simplifyDebts({ ...balancesCents });
  return simplified
    .filter(s => s.from === userId || s.to === userId)
    .map(s => ({
      userId: s.from === userId ? s.to : s.from,
      name: nameMap[s.from === userId ? s.to : s.from] || 'Someone',
      amount: s.amount,
      direction: s.to === userId ? 'you_receive' : 'you_pay',
    }))
    .sort((a, b) => b.amount - a.amount);
};
