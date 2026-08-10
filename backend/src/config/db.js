import mongoose from 'mongoose';

const RETRY_DELAY_MS = Number(process.env.MONGO_RETRY_DELAY_MS) || 3000;
const RETRY_LIMIT = Number(process.env.MONGO_RETRY_LIMIT) || 5;

/**
 * Sleeps for a given number of milliseconds.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connects to MongoDB with retry logic.
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  let attempt = 0;

  while (attempt < RETRY_LIMIT) {
    attempt += 1;

    try {
      await mongoose.connect(mongoUri);
      console.log(`[db] connected to MongoDB on attempt ${attempt}`);
      return;
    } catch (error) {
      const isLastAttempt = attempt >= RETRY_LIMIT;
      console.error(`[db] MongoDB connection failed on attempt ${attempt}:`, error.message);

      if (isLastAttempt) {
        throw new Error(`[db] unable to connect after ${RETRY_LIMIT} attempts`);
      }

      console.log(`[db] retrying MongoDB connection in ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);
    }
  }
};

export default connectDB;
