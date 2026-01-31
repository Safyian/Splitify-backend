/* =====================================
   CENT-BASED SPLIT CALCULATIONS
===================================== */

// Equal splits
export const calculateEqualSplits = (amount, splits) => {
  const totalCents = Math.round(amount * 100);

  const base = Math.floor(totalCents / splits.length);
  let remainder = totalCents % splits.length;

  return splits.map(s => {
    let share = base;

    if (remainder > 0) {
      share += 1;
      remainder--;
    }

    return {
      user: s.user,
      amount: share / 100
    };
  });
};

// Percentage-based splits
export const calculatePercentageSplits = (amount, splits) => {
  const totalCents = Math.round(amount * 100);

  const centsSplits = splits.map(s => ({
    user: s.user,
    cents: Math.floor((totalCents * s.percentage) / 100)
  }));

  let distributed = centsSplits.reduce((a,b)=>a+b.cents,0);
  let remainder = totalCents - distributed;

  for (let i = 0; remainder > 0; i++) {
    centsSplits[i % centsSplits.length].cents++;
    remainder--;
  }

  return centsSplits.map(s => ({
    user: s.user,
    amount: s.cents / 100
  }));
};

// Exact amount splits
export const calculateExactSplits = (amount, splits) => {

  const totalCents = Math.round(amount * 100);

  let sumCents = 0;

  const centsSplits = splits.map(s => {
    const cents = Math.round(s.amount * 100);
    sumCents += cents;

    return {
      user: s.user,
      cents
    };
  });

  if (sumCents !== totalCents) {
    throw new Error(
      `Split amounts (${sumCents/100}) do not equal total (${amount})`
    );
  }

  return centsSplits.map(s => ({
    user: s.user,
    amount: s.cents / 100
  }));
};
