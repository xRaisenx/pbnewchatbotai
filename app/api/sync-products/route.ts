import { AdminFetchResult, AdminShopifyProductNode, fetchAdminShopifyProducts } from '@lib/shopify-admin';


import { Index as VectorIndex } from '@upstash/vector';
import { NextResponse } from 'next/server';


type VectorMetadata = {
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
};

type VectorRecord = {
  id: string;
  vector: number[];
  metadata: VectorMetadata;
};

// Initialize Upstash vector client
const vectorIndex = process.env.UPSTASH_VECTOR_URL && process.env.UPSTASH_VECTOR_TOKEN
  ? new VectorIndex({
      url: process.env.UPSTASH_VECTOR_URL,
      token: process.env.UPSTASH_VECTOR_TOKEN,
    })
  : null;

// Constants
const BATCH_SIZE_VECTOR = 25; // Reduced from 50 to lower write operations
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 second
const SECRET = process.env.CRON_SECRET || 'your-secret';

// Retry with exponential backoff
async function upsertWithRetry(
  vectorIndex: VectorIndex,
  batch: VectorRecord[],
  retryCount: number = 0
): Promise<void> {
  try {
    await vectorIndex.upsert(batch);
    console.log(`Successfully upserted batch of ${batch.length} vectors`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Exceeded daily write limit')) {
      if (retryCount >= MAX_RETRIES) {
        console.error(`Max retries (${MAX_RETRIES}) reached for batch of ${batch.length}. Skipping.`);
        throw err;
      }

      // Calculate delay with exponential backoff
      const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`Upstash write limit exceeded. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Reduce batch size for retry if possible
      if (batch.length > 1) {
        const newBatchSize = Math.max(1, Math.floor(batch.length / 2));
        console.log(`Reducing batch size to ${newBatchSize} for retry`);
        const smallerBatches = [];
        for (let i = 0; i < batch.length; i += newBatchSize) {
          smallerBatches.push(batch.slice(i, i + newBatchSize));
        }

        // Retry smaller batches
        for (const smallerBatch of smallerBatches) {
          await upsertWithRetry(vectorIndex, smallerBatch, retryCount + 1);
        }
      } else {
        // Single item, retry without splitting
        await upsertWithRetry(vectorIndex, batch, retryCount + 1);
      }
    } else {
      console.error('Unexpected error during upsert:', err);
      throw err;
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== SECRET) {
    console.error('Unauthorized sync attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let cursor: string | null = null;
  let fetched = 0;
  let processed = 0;
  let errors = 0;
  const vectorUpsertBatch: VectorRecord[] = [];

  try {
    do {
      const result: AdminFetchResult = await fetchAdminShopifyProducts(cursor);
      const products = result.products;
      cursor = result.pageInfo.endCursor;

      for (const product of products) {
        try {
          // Transform product into vector data (example transformation)
          const vectorData: VectorRecord = {
            id: product.id,
            vector: await generateVector(product), // Assume this function exists
            metadata: {
              title: product.title,
              handle: product.handle,
              vendor: product.vendor as string,
              productType: product.productType as string,
              tags: product.tags as string[],
            },
          };

          vectorUpsertBatch.push(vectorData);

          if (vectorUpsertBatch.length >= BATCH_SIZE_VECTOR) {
            if (vectorIndex) {
              await upsertWithRetry(vectorIndex, vectorUpsertBatch);
              vectorUpsertBatch.length = 0;
            } else {
              console.warn('Vector client not initialized. Skipping upsert batch.');
              errors += vectorUpsertBatch.length;
            }
          }

          processed++;
        } catch (err) {
          console.error(`Error processing product ${product.title}:`, err);
          errors++;
        }
      }

      fetched += products.length;
    } while (cursor && fetched < 500); // Reduced limit to conserve writes

    // Upsert any remaining vectors
    if (vectorUpsertBatch.length > 0 && vectorIndex) {
      await upsertWithRetry(vectorIndex, vectorUpsertBatch);
    }

    console.log(`Sync complete. Fetched: ${fetched}, Processed: ${processed}, Errors: ${errors}`);
    return NextResponse.json({ fetched, processed, errors });
  } catch (err) {
    console.error('Sync failed:', err);
    return NextResponse.json({ error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// Placeholder for vector generation (implement as needed)
async function generateVector(product: AdminShopifyProductNode): Promise<number[]> { // eslint-disable-line @typescript-eslint/no-unused-vars
  // Example: Generate a dummy vector
  // Replace with actual vector generation logic (e.g., using an embedding model)
  return Array(128).fill(0).map(() => Math.random());
}
