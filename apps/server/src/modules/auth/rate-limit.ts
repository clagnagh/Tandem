// Fixed-window counters in Redis (docs/adr/0009). One Lua script bumps every
// counter for an attempt atomically, so two server instances cannot race.
import type { Redis } from 'ioredis';

// For each key: count this attempt, start the window on the first one, and
// repair a key that lost its expiry. Returns count and seconds left per key.
const HIT_SCRIPT = `
local results = {}
for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local ttl = redis.call('TTL', key)
  if count == 1 or ttl < 0 then
    redis.call('EXPIRE', key, ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  table.insert(results, count)
  table.insert(results, ttl)
end
return results
`;

export interface LimitResult {
  allowed: boolean;
  /** Seconds until every exceeded counter resets; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one attempt against every key. Throws if Redis is unreachable. */
  hit: (keys: string[]) => Promise<LimitResult>;
}

export function createRateLimiter(
  redis: Redis,
  options: { keyPrefix: string; maxAttempts: number; windowSeconds: number },
): RateLimiter {
  return {
    hit: async (keys) => {
      const prefixed = keys.map((k) => `${options.keyPrefix}${k}`);
      const raw = (await redis.eval(
        HIT_SCRIPT,
        prefixed.length,
        ...prefixed,
        options.windowSeconds,
      )) as number[];
      let retryAfterSeconds = 0;
      for (let i = 0; i < raw.length; i += 2) {
        const count = raw[i] ?? 0;
        const ttl = raw[i + 1] ?? options.windowSeconds;
        if (count > options.maxAttempts) retryAfterSeconds = Math.max(retryAfterSeconds, ttl, 1);
      }
      return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
    },
  };
}
