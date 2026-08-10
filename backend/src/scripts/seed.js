import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

const DEMO_PASSWORD = 'Password123';

const demoUsers = [
  { name: 'Alice Johnson', email: 'alice@chatters.test' },
  { name: 'Bob Smith', email: 'bob@chatters.test' },
  { name: 'Charlie Brown', email: 'charlie@chatters.test' },
  { name: 'Diana Prince', email: 'diana@chatters.test' },
  { name: 'Ethan Hunt', email: 'ethan@chatters.test' },
  { name: 'Fiona Gallagher', email: 'fiona@chatters.test' },
  { name: 'George Miller', email: 'george@chatters.test' },
  { name: 'Hannah Baker', email: 'hannah@chatters.test' },
  { name: 'Ian Malcolm', email: 'ian@chatters.test' },
  { name: 'Julia Roberts', email: 'julia@chatters.test' },
];

const seed = async () => {
  await connectDB();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const demoUser of demoUsers) {
    const existing = await User.findOne({ email: demoUser.email });

    if (existing) {
      console.log(`Skipped  ${demoUser.email} (already exists)`);
      continue;
    }

    await User.create({
      name: demoUser.name,
      email: demoUser.email,
      passwordHash,
    });

    console.log(`Created  ${demoUser.email}`);
  }

  console.log(`\nAll demo users share the password: ${DEMO_PASSWORD}`);
  await mongoose.connection.close();
};

seed().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
