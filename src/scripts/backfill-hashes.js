import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.js';
import { hashContact } from '../utils/hash.helper.js';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const users = await User.find({});
let updated = 0;

for (const user of users) {
  let changed = false;
  if (user.email && !user.emailHash) {
    user.emailHash = hashContact(user.email);
    changed = true;
  }
  if (user.phone && !user.phoneHash) {
    user.phoneHash = hashContact(user.phone);
    changed = true;
  }
  if (changed) {
    await user.save();
    updated++;
  }
}

console.log(`Backfilled ${updated} users`);
await mongoose.disconnect();
