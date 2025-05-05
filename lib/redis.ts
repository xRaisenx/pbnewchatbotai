// lib/redis.ts

import { Index } from '@upstash/vector';
import { createClient } from 'redis'; // ✅ Use 'redis' not '@redis/client'
import type { RedisClientType } from 'redis'; // ✅ Type support for the client

export const UPSTASH_VECTOR_INDEX_NAME = 'idx:products_vss';

if (!process.env.VECTOR_URL_BM25 || !process.env.VECTOR_TOKEN_BM25) {
  throw new Error(
    'Missing Upstash Vector BM25 credentials. Set VECTOR_URL_BM25 and VECTOR_TOKEN_BM25 in .env.local.'
  );
}

export const vectorIndex = new Index({
  url: process.env.VECTOR_URL_BM25,
  token: process.env.VECTOR_TOKEN_BM25,
});

export const redisClient: RedisClientType = createClient({
  url: process.env.AICHATBOTZ_KV_URL,
});

redisClient.on('error', (err: Error) => {
  console.error('Redis Client Error:', err);
});

redisClient.connect().catch((err: Error) => {
  console.error('Redis Connect Error:', err);
});
