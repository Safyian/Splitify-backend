/* =====================================
   CENT-BASED SPLIT CALCULATIONS
===================================== */

// Equal splits
// export const calculateEqualSplits = (amount, splits) => {
//   const totalCents = Math.round(amount * 100);

//   const base = Math.floor(totalCents / splits.length);
//   let remainder = totalCents % splits.length;

//   return splits.map(s => {
//     let share = base;

//     if (remainder > 0) {
//       share += 1;
//       remainder--;
//     }

//     return {
//       user: s.user,
//       amount: share / 100
//     };
//   });
// };
export const calculateEqualSplits = (amount, splits) => {
  const totalCents = Math.round(amount * 100);
  const perPerson = Math.floor(totalCents / splits.length);
  const remainder = totalCents - perPerson * splits.length;

  return splits.map((split, i) => ({
    user: split.user,
    amount: (perPerson + (i < remainder ? 1 : 0)) / 100,
    percentage: null  // ✅ explicitly null for equal splits
  }));
};

// Percentage-based splits
export const calculatePercentageSplits = (amount, splits) => {
  const totalCents = Math.round(amount * 100);

  const calculated = splits.map(split => {
    const cents = Math.floor(totalCents * (split.percentage / 100));
    return {
      user: split.user,
      amount: cents,
      percentage: split.percentage  // ✅ store it
    };
  });

  // Distribute remainder cents
  const distributed = calculated.reduce((sum, s) => sum + s.amount, 0);
  let remainder = totalCents - distributed;

  let i = 0;
  while (remainder > 0) {
    calculated[i % calculated.length].amount += 1;
    remainder--;
    i++;
  }

  return calculated.map(s => ({
    user: s.user,
    amount: s.amount / 100,
    percentage: s.percentage  // ✅ preserve after remainder distribution
  }));
};

// Exact amount splits
export const calculateExactSplits = (amount, splits) => {
  const totalCents = Math.round(amount * 100);
  const splitCents = splits.map(s => Math.round(s.amount * 100));
  const splitTotal = splitCents.reduce((sum, c) => sum + c, 0);

  if (splitTotal !== totalCents) {
    throw new Error(
      `Exact splits (${splitTotal / 100}) must equal total (${amount})`
    );
  }

  return splits.map((split, i) => ({
    user: split.user,
    amount: splitCents[i] / 100,
    percentage: null  // ✅ explicitly null for exact splits
  }));
};
