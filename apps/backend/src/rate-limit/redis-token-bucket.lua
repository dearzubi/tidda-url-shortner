local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_tokens = tonumber(ARGV[2])
local refill_interval_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local redis_time = redis.call('TIME')
local now_ms = (tonumber(redis_time[1]) * 1000) + math.floor(tonumber(redis_time[2]) / 1000)

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill_at_ms')
local tokens = tonumber(bucket[1])
local last_refill_at_ms = tonumber(bucket[2])

if tokens == nil or last_refill_at_ms == nil then
  tokens = capacity
  last_refill_at_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - last_refill_at_ms)
local refilled_tokens = (elapsed_ms * refill_tokens) / refill_interval_ms
tokens = math.min(capacity, tokens + refilled_tokens)

local allowed = 0

if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
end

local reset_after_ms = 0

if tokens < cost then
  reset_after_ms = math.ceil(((cost - tokens) * refill_interval_ms) / refill_tokens)
end

local retry_after_ms = 0

if allowed == 0 then
  retry_after_ms = reset_after_ms
end

redis.call('HSET', key, 'tokens', tokens, 'last_refill_at_ms', now_ms)
redis.call('PEXPIRE', key, ttl_ms)

local reset_at_epoch_seconds = math.floor((now_ms + reset_after_ms) / 1000)

-- Return tuple:
-- 1. allowed: 1 when the request consumed tokens, otherwise 0
-- 2. remaining: whole tokens left after the decision
-- 3. retry_after_seconds: seconds until retry when rejected, otherwise 0
-- 4. reset_at_epoch_seconds: Unix timestamp when one token is available
-- 5. limit: bucket capacity
return {
  allowed,
  math.max(0, math.floor(tokens)),
  math.ceil(retry_after_ms / 1000),
  reset_at_epoch_seconds,
  capacity
}
