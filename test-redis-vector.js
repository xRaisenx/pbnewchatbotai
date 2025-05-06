import { Redis } from "@upstash/redis";
import * as dotenv from 'dotenv'
dotenv.config()

async function testRedis() {
  const redis = new Redis({
    url: process.env.KV_CHA_KV_REST_API_URL || process.env.REDIS_URL,
    token: process.env.KV_CHA_KV_REST_API_TOKEN || process.env.REDIS_TOKEN,
  });

    const key = "test-key";
  const value = "test-value";

  try {
    // Set the key
    await redis.set(key, value);
    console.log(`Set key "${key}" with value "${value}"`);

    // Get the key
    const retrievedValue = await redis.get(key);
    console.log(`Retrieved value for key "${key}": "${retrievedValue}"`);

    // Check if the value is correct
    if (retrievedValue === value) {
      console.log("Test passed: Value matches");
    } else {
      console.error("Test failed: Value does not match");
    }

    // Delete the key
    await redis.del(key);
    console.log(`Deleted key "${key}"`);

    // Try to get the key again
    const deletedValue = await redis.get(key);
    console.log(`Retrieved value for key "${key}" after deletion: "${deletedValue}"`);

    if (deletedValue === null) {
      console.log("Test passed: Key was deleted");
    } else {
      console.error("Test failed: Key was not deleted");
    }
  } catch (error) {
    console.error("Redis test failed:", error);
  }
}

testRedis();
