import "dotenv/config";
import mongoose from "mongoose";
import Group from "../src/models/group.js";
import Expense from "../src/models/expense.js";
import User from "../src/models/user.js";
import { calculateGroupBalances } from "../src/utils/balance.js";

const BALANCE_THRESHOLD = 0.01;

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  const groups = await Group.find({});
  console.log(`Found ${groups.length} group(s) to process\n`);

  let groupsProcessed = 0;
  let groupsStamped = 0;
  let totalRecordsStamped = 0;

  for (const group of groups) {
    groupsProcessed++;

    const expenses = await Expense.find({ group: group._id })
      .populate("paidBy")
      .populate("splits.user");

    // Idempotency guard: skip if any record is already stamped
    const alreadyMigrated = expenses.some(e => e.settledCycleId != null);
    if (alreadyMigrated) {
      console.log(`[SKIP]    ${group._id}  "${group.name}"  — already migrated`);
      continue;
    }

    if (expenses.length === 0) {
      console.log(`[SKIP]    ${group._id}  "${group.name}"  — no expenses`);
      // Ensure settledAt is cleared for empty groups
      if (group.settledAt) {
        group.settledAt = null;
        await group.save();
      }
      continue;
    }

    const balances = calculateGroupBalances(group, expenses);
    const allSettled = Object.values(balances).every(b => Math.abs(b) < BALANCE_THRESHOLD);

    if (allSettled) {
      const cycleId = new mongoose.Types.ObjectId();

      const result = await Expense.updateMany(
        { group: group._id, settledCycleId: null },
        { $set: { settledCycleId: cycleId } }
      );
      const stamped = result.modifiedCount;

      // Set settledAt to the latest expense createdAt if not already set
      if (!group.settledAt) {
        const latest = expenses.reduce((max, e) =>
          e.createdAt > max ? e.createdAt : max,
          expenses[0].createdAt
        );
        group.settledAt = latest;
        await group.save();
      }

      groupsStamped++;
      totalRecordsStamped += stamped;
      console.log(`[STAMP]   ${group._id}  "${group.name}"  — settled=true  stamped=${stamped}  cycleId=${cycleId}`);
    } else {
      // Ensure settledAt is null for unsettled groups
      if (group.settledAt) {
        group.settledAt = null;
        await group.save();
      }
      console.log(`[LIVE]    ${group._id}  "${group.name}"  — settled=false  records left live=${expenses.length}`);
    }
  }

  console.log(`
────────────────────────────────────────
Groups processed : ${groupsProcessed}
Groups stamped   : ${groupsStamped}
Records stamped  : ${totalRecordsStamped}
────────────────────────────────────────`);

  await mongoose.disconnect();
  console.log("Disconnected. Done.");
}

main().catch(err => {
  console.error("Migration failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
