import { createClient } from 'redis';

let redisClient = null;

/**
 * Creates and connects a Redis client.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export const connectRedis = async () => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('[redis] REDIS_URL is not set, skipping Redis connection');
    return null;
  }

  redisClient = createClient({
    url: redisUrl,
  });

  /**
   * Logs redis client errors.
   * @param {Error} error - Redis runtime error.
   * @returns {void}
   */
  const onRedisError = (error) => {
    console.error('[redis] client error:', error.message);
  };

  redisClient.on('error', onRedisError);
  await redisClient.connect();

  console.log('[redis] connected');
  return redisClient;
};

/**
 * Returns the active Redis client instance.
 * @returns {import('redis').RedisClientType | null}
 */
export const getRedisClient = () => redisClient;

/**
 * Disconnects Redis if connected.
 * @returns {Promise<void>}
 */
export const disconnectRedis = async () => {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = null;
  console.log('[redis] disconnected');
};
