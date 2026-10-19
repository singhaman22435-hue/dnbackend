// ─── High Performance Cache (In-Memory + Optional Redis / Upstash) ───
// Designed for 10,000+ daily visits on free-tier hosting to prevent DB exhaustion.

let redisClient = null;

// Initialize Redis if REDIS_URL or UPSTASH_REDIS_URL is provided in environment
if (process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL) {
  try {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true
    });
    redisClient.connect().then(() => {
      console.log('⚡ Connected to External Redis Cache');
    }).catch(err => {
      console.warn('⚠️ Redis connection failed, falling back to In-Memory cache:', err.message);
      redisClient = null;
    });
  } catch (e) {
    console.warn('⚠️ ioredis package not found or failed, using ultra-fast In-Memory cache.');
    redisClient = null;
  }
}

// In-Memory Fast Cache Map
const memoryCache = new Map();

/**
 * Get cached data by key
 */
const getCache = async (key) => {
  if (redisClient) {
    try {
      const val = await redisClient.get(key);
      if (val) return JSON.parse(val);
    } catch (e) {}
  }
  
  const item = memoryCache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
};

/**
 * Set cache with TTL in seconds (default 3 minutes = 180s)
 */
const setCache = async (key, data, ttlSeconds = 180) => {
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (e) {}
  }
  
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
};

/**
 * Invalidate specific key or prefix
 */
const deleteCache = async (prefixOrKey) => {
  if (redisClient) {
    try {
      const keys = await redisClient.keys(`${prefixOrKey}*`);
      if (keys && keys.length) await redisClient.del(...keys);
    } catch (e) {}
  }

  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefixOrKey)) {
      memoryCache.delete(k);
    }
  }
};

/**
 * Clear all cache
 */
const clearAllCache = async () => {
  if (redisClient) {
    try { await redisClient.flushdb(); } catch (e) {}
  }
  memoryCache.clear();
};

module.exports = {
  getCache,
  setCache,
  deleteCache,
  clearAllCache
};
