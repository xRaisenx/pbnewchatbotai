import { AdminFetchResult, AdminShopifyProductNode, fetchAdminShopifyProducts } from '@lib/shopify-admin';
// Import the main Index type and the specific Vector type returned by fetch
import { Vector, Index as VectorIndex } from '@upstash/vector';
import deepEqual from 'fast-deep-equal'; // Correct for default export
import { NextResponse } from 'next/server';

// --- Configuration ---
// IMPORTANT: Ensure these point to a TEXT-BASED (BM25) Upstash Vector index
const VECTOR_URL = process.env.VECTOR_URL_BM25_4;
const VECTOR_TOKEN = process.env.VECTOR_TOKEN_BM25_4;
const CRON_SECRET = process.env.CRON_SECRET; // CRITICAL for security

// Constants
const BATCH_SIZE_SHOPIFY_FETCH = 50; // How many products to fetch from Shopify at once
const BATCH_SIZE_VECTOR_OPS = 50;  // How many records to fetch/upsert from/to Vector at once
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // milliseconds
const REQUEST_THROTTLE_DELAY = 500; // milliseconds between successful batches
const DAILY_WRITE_LIMIT = 10000; // Upstash free tier limit (confirm your plan)

// Global state (consider persistent storage for robust write count in serverless)
let totalWritesToday = 0;

// --- Type Definitions ---

/**
 * Extend AdminShopifyProductNode to include description field.
 */
interface ExtendedAdminShopifyProductNode extends AdminShopifyProductNode {
  description?: string;
}

/**
 * Defines the structure of the metadata object stored in Upstash Vector.
 * MUST MATCH the structure expected by the chat/query code (`ProductVectorMetadata`).
 */
type VectorMetadata = {
  id: string;              // Shopify Product GID (e.g., "gid://shopify/Product/12345")
  handle: string;          // Product handle (e.g., "red-lipstick")
  title: string;           // Product title
  price: string;           // Price as a string (e.g., "19.99")
  imageUrl: string | null; // URL of the first product image
  productUrl: string;      // Relative URL to the product page (e.g., "/products/red-lipstick")
  variantId?: string;      // Shopify Variant GID of the first variant (optional)
  vendor?: string | null;  // Product vendor (e.g., "Brand Name")
  productType?: string | null; // Product type (e.g., "Cosmetics")
  tags?: string;           // Comma-separated string of tags (e.g., "vegan, cruelty-free, long-lasting")
  usageInstructions?: string; // Optional: Instructions (potentially from description or metafield)
  // Add any other fields required by the chat/query code here
};

/**
 * Type for the individual records prepared for potential upsert (matching text format).
 */
type TextVectorRecord = {
  id: string;
  data: string;
  metadata: VectorMetadata;
};

/**
 * Type for the Vector object returned by Upstash fetch, specialized with our metadata.
 */
type FetchedVector = Vector<VectorMetadata>;

// --- Upstash Vector Initialization ---
// Use generic type <VectorMetadata> for better type checking with metadata
let vectorIndex: VectorIndex<VectorMetadata> | null = null;
if (VECTOR_URL && VECTOR_TOKEN) {
  try {
    // Initialize WITHOUT embedding options for a TEXT-BASED index
    vectorIndex = new VectorIndex<VectorMetadata>({
      url: VECTOR_URL,
      token: VECTOR_TOKEN,
    });
    console.log('Vector index initialized for Text/BM25:', VECTOR_URL.replace(/\/[^/]+$/, '/[redacted]'));
  } catch (error) {
    console.error('Failed to initialize Upstash Vector Index:', error);
  }
} else {
  console.error('VECTOR_URL_BM25_4 and/or VECTOR_TOKEN_BM25_4 environment variables are not set.');
}

// --- Helper Functions ---

/**
 * Generates a combined text string from product details for BM25 search index.
 */
function generateSearchableData(product: ExtendedAdminShopifyProductNode, metadata: VectorMetadata): string {
  const description = product.description || '';
  const data = [
    metadata.title,
    metadata.handle,
    metadata.vendor || '',
    metadata.productType || '',
    metadata.tags || '',
    metadata.price,
    description
  ].join(' ')
    .toLowerCase()
    .replace(/[^\w\s]|_/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return data;
}

/** Gets the ID (GID) of the first variant. */
function getFirstVariantId(product: ExtendedAdminShopifyProductNode): string | undefined {
  return product.variants?.edges?.[0]?.node?.id;
}

/** Gets the URL of the first image. */
function getFirstImageUrl(product: ExtendedAdminShopifyProductNode): string | null {
  return product.images?.edges?.[0]?.node?.url || null;
}

/**
 * Helper to compare if the essential parts of two records are equal.
 * Uses fast-deep-equal for robust object comparison.
 */
function areRecordsEqual(newRecord: TextVectorRecord, existingRecord: FetchedVector | null): boolean {
    if (!existingRecord) {
        return false; // If existing is null, it's definitely not equal (it's a new record)
    }
    // Compare the searchable data string AND the metadata object
    // fast-deep-equal handles nested objects and different property orders
    return newRecord.data === existingRecord.data && deepEqual(newRecord.metadata, existingRecord.metadata);
}

/**
 * Attempts to upsert a batch of records to Upstash Vector with retry logic.
 */
async function upsertBatchWithRetry(
  index: VectorIndex<VectorMetadata>,
  batch: TextVectorRecord[],
  retryCount: number = 0
): Promise<void> {
  if (!batch.length) {
    console.log("Upsert skipped: Empty batch.");
    return;
  }

  // Check write limit before the API call
  if (totalWritesToday + batch.length > DAILY_WRITE_LIMIT) {
      console.warn(`Upsert skipped: Batch of ${batch.length} would exceed the daily write limit (${DAILY_WRITE_LIMIT}). Current writes: ${totalWritesToday}`);
      // Throw an error here as we decided this batch *should* be written but can't be.
      // This signals a failure state for these specific items.
      throw new Error(`Daily write limit reached. Cannot upsert batch of ${batch.length}.`);
  }

  try {
    await index.upsert(batch);
    totalWritesToday += batch.length;
    console.log(`Successfully upserted batch of ${batch.length}. Total writes today: ${totalWritesToday}/${DAILY_WRITE_LIMIT}`);

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Error upserting batch (Attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, errorMessage);

    // --- CRITICAL ERROR CHECK ---
    const isEmbeddingConfigError = errorMessage.includes('Embedding data for this index is not allowed') ||
                                   errorMessage.includes('index must be created with an embedding model');
    if (isEmbeddingConfigError) {
      console.error("------------------------------------------------------------------");
      console.error("FATAL ERROR: Upstash index configuration mismatch!");
      console.error("The index at", VECTOR_URL ? VECTOR_URL.replace(/\/[^/]+$/, '/[redacted]') : "UNKNOWN URL", "expects embeddings.");
      console.error("This script is sending TEXT data for BM25 search.");
      console.error("ACTION REQUIRED: Recreate the Upstash index WITHOUT selecting an embedding model.");
      console.error("------------------------------------------------------------------");
      throw new Error(`Upstash index configuration mismatch: ${errorMessage}. Index requires embeddings, but code is sending text.`);
    }
    // --- END CRITICAL ERROR CHECK ---

    // Handle Write Limit Exceeded Error (might happen despite initial check)
    const isWriteLimitError = errorMessage.includes('Exceeded daily write limit') || errorMessage.includes('Daily write limit');
    if (isWriteLimitError) {
      console.warn(`Daily write limit hit during upsert attempt. Current writes: ${totalWritesToday}. Stopping further writes for this run.`);
      totalWritesToday = DAILY_WRITE_LIMIT; // Mark limit as definitively reached
      throw err; // Re-throw to signal failure for this specific batch
    }

    // Handle other potentially transient errors with retries
    if (retryCount >= MAX_RETRIES) {
      console.error(`Max retries (${MAX_RETRIES}) reached for upserting batch of ${batch.length}. Skipping batch.`);
      throw err; // Re-throw the error after max retries
    }

    const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
    console.warn(`Retrying upsert batch in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    await upsertBatchWithRetry(index, batch, retryCount + 1);
  }
}

/**
 * Fetches existing records from Upstash Vector for a given set of IDs.
 * Includes basic retry logic for transient network errors.
 */
async function fetchExistingRecords(
    index: VectorIndex<VectorMetadata>,
    ids: string[],
    retryCount: number = 0
): Promise<(FetchedVector | null)[]> {
    if (ids.length === 0) {
        return [];
    }
    try {
        // Fetch includes metadata by default if the index was typed with it
        const results = await index.fetch(ids, { includeMetadata: true });
        return results;
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Error fetching records (Attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, errorMessage);
        if (retryCount >= MAX_RETRIES) {
            console.error(`Max retries reached for fetching records with IDs: ${ids.slice(0, 5).join(', ')}... Skipping comparison for this batch.`);
            // Return an array of nulls, treating them as potentially new/changed to be safe, or throw
             throw new Error(`Failed to fetch records after ${MAX_RETRIES} retries.`);
            // return ids.map(() => null); // Alternative: treat as potentially needing update
        }
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.warn(`Retrying fetch in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchExistingRecords(index, ids, retryCount + 1);
    }
}

// --- API Route Handler (GET for Cron Job) ---
export async function GET(request: Request) {
  // 1. Authorization
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (!CRON_SECRET) {
    console.error("CRITICAL SECURITY RISK: CRON_SECRET is not set in environment variables.");
    return NextResponse.json({ error: 'Server configuration error: Secret not set.' }, { status: 500 });
  }
  if (secret !== CRON_SECRET) {
    console.warn('Unauthorized sync attempt: Invalid secret.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check Vector Index Initialization
  if (!vectorIndex) {
    console.error('Vector index is not initialized. Check environment variables and connection.');
    return NextResponse.json({ error: 'Vector index setup failed' }, { status: 500 });
  }

  // 3. Reset write count
  totalWritesToday = 0;
  console.log(`Starting Shopify product sync to Upstash Vector (Text/BM25)... Daily limit: ${DAILY_WRITE_LIMIT}`);

  // --- Main Sync Logic ---
  let cursor: string | null = null;
  let fetchedProducts = 0; // From Shopify
  let processedProducts = 0; // Processed for comparison
  let skippedProducts = 0; // Found in Vector and unchanged
  let productsToUpsertCount = 0; // Queued for actual upsert
  let errorCount = 0;
  // Holds the processed data from Shopify for the current batch cycle
  const currentBatchPotentialRecords: TextVectorRecord[] = [];

  try {
    do {
      // Check write limit *before* fetching from Shopify
      if (totalWritesToday >= DAILY_WRITE_LIMIT) {
        console.warn(`Daily write limit (${DAILY_WRITE_LIMIT}) reached before fetching next Shopify batch. Stopping sync.`);
        break;
      }

      console.log(`Fetching Shopify products (batch size ${BATCH_SIZE_SHOPIFY_FETCH}) ${cursor ? `after cursor ${cursor.substring(0, 10)}...` : 'from start'}...`);
      // Fetch products using the defined batch size for Shopify API
      const result: AdminFetchResult = await fetchAdminShopifyProducts(cursor, BATCH_SIZE_SHOPIFY_FETCH);
      const products = result.products as ExtendedAdminShopifyProductNode[];
      cursor = result.pageInfo.endCursor;
      fetchedProducts += products.length;

      if (products.length === 0) {
        console.log(`Fetched 0 products.${cursor ? ' Continuing check with cursor.' : ' No more products found from Shopify.'}`);
        if (!cursor) break; // No products and no next page, we're done
        continue; // Empty page from Shopify, but cursor exists, try next page
      }

      console.log(`Fetched ${products.length} products. Processing...`);

      // Process Shopify products and prepare potential records
      for (const product of products) {
         processedProducts++;
         try {
             // --- Construct Metadata ---
             const metadata: VectorMetadata = {
                 id: product.id,
                 handle: product.handle,
                 title: product.title,
                 price: product.priceRange?.minVariantPrice?.amount || '0.00',
                 imageUrl: getFirstImageUrl(product),
                 productUrl: `/products/${product.handle}`,
                 variantId: getFirstVariantId(product),
                 vendor: product.vendor || null,
                 productType: product.productType || null,
                 tags: product.tags?.length ? product.tags.join(', ') : undefined,
                 // usageInstructions: ...,
             };
             // --- Generate Searchable Text ---
             const searchableData = generateSearchableData(product, metadata);
             // --- Prepare Potential Record ---
             const potentialRecord: TextVectorRecord = {
                 id: metadata.id,
                 data: searchableData,
                 metadata: metadata,
             };
             currentBatchPotentialRecords.push(potentialRecord);

         } catch (processingError: unknown) {
             const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
             console.error(`Error preparing product data ${product.id} (${product.title}):`, errorMessage);
             errorCount++; // Count errors during local processing
         }

         // --- Process Batch when Full or End of Shopify Data ---
         if (currentBatchPotentialRecords.length >= BATCH_SIZE_VECTOR_OPS || (!cursor && products.indexOf(product) === products.length - 1)) {
             if (currentBatchPotentialRecords.length === 0) continue; // Skip if batch became empty due to errors

             console.log(`--- Comparing Batch of ${currentBatchPotentialRecords.length} products with Upstash ---`);
             const idsToFetch = currentBatchPotentialRecords.map(p => p.id);
             let existingRecords: (FetchedVector | null)[] = [];
             try {
                 existingRecords = await fetchExistingRecords(vectorIndex, idsToFetch);
             } catch (fetchError: unknown) {
                 const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
                 console.error(`Failed to fetch batch for comparison: ${errorMessage}. Skipping comparison and attempting upsert for safety.`);
                 errorCount += currentBatchPotentialRecords.length; // Count fetch failure as errors for these items
                 // Fall through to upsert logic, but the upsert batch will contain everything
             }

             const existingRecordsMap = new Map<string, FetchedVector | null>();
             if (existingRecords.length === idsToFetch.length) {
                 for (let i = 0; i < idsToFetch.length; i++) {
                     existingRecordsMap.set(idsToFetch[i], existingRecords[i]);
                 }
             } else if (existingRecords.length > 0) {
                 // Fallback if fetch somehow returned partial results (less likely with SDK)
                 console.warn(`Fetch returned ${existingRecords.length} results for ${idsToFetch.length} IDs. Mapping by ID.`);
                 existingRecords.forEach(rec => { if (rec) existingRecordsMap.set(rec.id, rec); });
             }

             const batchToActuallyUpsert: TextVectorRecord[] = [];
             for (const potentialRecord of currentBatchPotentialRecords) {
                 const existingRecord = existingRecordsMap.get(potentialRecord.id);

                 if (!areRecordsEqual(potentialRecord, existingRecord ?? null )) {
                     // Records are different or the existing one doesn't exist. Needs upsert.
                     batchToActuallyUpsert.push(potentialRecord);
                     productsToUpsertCount++;
                 } else {
                     // Records are identical, skip upsert for this one.
                     skippedProducts++;
                 }
             }

             // Clear the potential batch for the next cycle BEFORE the async upsert
             currentBatchPotentialRecords.length = 0;

             // --- Actual Upsert (if needed) ---
             if (batchToActuallyUpsert.length > 0) {
                // Check write limit AGAIN before the actual upsert call
                 if (totalWritesToday + batchToActuallyUpsert.length <= DAILY_WRITE_LIMIT) {
                    try {
                        console.log(`Found ${batchToActuallyUpsert.length} new/changed products. Upserting...`);
                        await upsertBatchWithRetry(vectorIndex, batchToActuallyUpsert);
                        // Throttle after successful upsert
                        await new Promise((resolve) => setTimeout(resolve, REQUEST_THROTTLE_DELAY));
                    } catch (upsertError: unknown) {
                        const errorMessage = upsertError instanceof Error ? upsertError.message : String(upsertError);
                        console.error(`Failed to upsert filtered batch: ${errorMessage}`);
                        errorCount += batchToActuallyUpsert.length; // Count failed upserts
                        // If write limit was hit inside retry, totalWritesToday is updated
                        if (totalWritesToday >= DAILY_WRITE_LIMIT) {
                            console.warn("Write limit reached during upsert attempt. Stopping sync.");
                            break; // Exit the inner loop (and subsequently outer)
                        }
                    }
                 } else {
                     console.warn(`Skipping final upsert for ${batchToActuallyUpsert.length} products as it would exceed write limit (${DAILY_WRITE_LIMIT}). Current: ${totalWritesToday}`);
                     errorCount += batchToActuallyUpsert.length; // Count items we couldn't write due to limit
                     skippedProducts -= batchToActuallyUpsert.length; // Adjust skipped count as these weren't skipped for being same
                     productsToUpsertCount -= batchToActuallyUpsert.length; // These weren't actually upserted
                     totalWritesToday = DAILY_WRITE_LIMIT; // Mark limit as hit
                     break; // Exit inner loop
                 }
             } else {
                 console.log("No changes detected in this batch. Skipping upsert.");
             }
         } // End of batch processing logic

         // Break inner loop if write limit was hit during upsert
         if (totalWritesToday >= DAILY_WRITE_LIMIT) {
            break;
         }

      } // End of for loop (iterating products from Shopify batch)

       // Break outer loop immediately if limit was hit inside inner loop/upsert
      if (totalWritesToday >= DAILY_WRITE_LIMIT) {
          console.warn("Write limit reached, breaking outer fetch loop.");
          break;
      }

    } while (cursor); // Continue fetching from Shopify if there's a next page cursor

    // Final Check: Process any remaining items in currentBatchPotentialRecords if the loop ended without processing them
    if (currentBatchPotentialRecords.length > 0 && totalWritesToday < DAILY_WRITE_LIMIT) {
        console.log(`--- Comparing Final Batch of ${currentBatchPotentialRecords.length} products with Upstash ---`);
        const idsToFetch = currentBatchPotentialRecords.map(p => p.id);
        let existingRecords: (FetchedVector | null)[] = [];
         try {
             existingRecords = await fetchExistingRecords(vectorIndex, idsToFetch);
         } catch (fetchError: unknown) {
             const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
             console.error(`Failed to fetch final batch for comparison: ${errorMessage}. Skipping comparison and attempting upsert for safety.`);
             errorCount += currentBatchPotentialRecords.length;
         }

        const existingRecordsMap = new Map<string, FetchedVector | null>();
         if (existingRecords.length === idsToFetch.length) {
             for (let i = 0; i < idsToFetch.length; i++) {
                 existingRecordsMap.set(idsToFetch[i], existingRecords[i]);
             }
         } else if (existingRecords.length > 0) {
            console.warn(`Final fetch returned ${existingRecords.length} results for ${idsToFetch.length} IDs. Mapping by ID.`);
            existingRecords.forEach(rec => { if (rec) existingRecordsMap.set(rec.id, rec); });
         }

        const batchToActuallyUpsert: TextVectorRecord[] = [];
        for (const potentialRecord of currentBatchPotentialRecords) {
            const existingRecord = existingRecordsMap.get(potentialRecord.id);
            if (!areRecordsEqual(potentialRecord, existingRecord ?? null)) {
                batchToActuallyUpsert.push(potentialRecord);
                productsToUpsertCount++;
            } else {
                skippedProducts++;
            }
        }

        if (batchToActuallyUpsert.length > 0) {
             if (totalWritesToday + batchToActuallyUpsert.length <= DAILY_WRITE_LIMIT) {
                try {
                    console.log(`Found ${batchToActuallyUpsert.length} new/changed products in final batch. Upserting...`);
                    await upsertBatchWithRetry(vectorIndex, batchToActuallyUpsert);
                } catch (upsertError: unknown) {
                     const errorMessage = upsertError instanceof Error ? upsertError.message : String(upsertError);
                     console.error(`Failed to upsert final filtered batch: ${errorMessage}`);
                     errorCount += batchToActuallyUpsert.length;
                }
             } else {
                 console.warn(`Skipping final upsert for ${batchToActuallyUpsert.length} products due to write limit (${DAILY_WRITE_LIMIT}). Current: ${totalWritesToday}`);
                 errorCount += batchToActuallyUpsert.length;
                 skippedProducts -= batchToActuallyUpsert.length;
                 productsToUpsertCount -= batchToActuallyUpsert.length;
             }
        } else {
            console.log("No changes detected in final batch. Skipping upsert.");
        }
    }

    // 4. Log Completion Summary
    const status = totalWritesToday >= DAILY_WRITE_LIMIT ? 'write_limit_reached' : 'complete';
    console.log("--- Sync Summary ---");
    console.log(`Status: ${status}`);
    console.log(`Shopify Products Fetched: ${fetchedProducts}`);
    console.log(`Products Processed: ${processedProducts}`);
    console.log(`Products Skipped (Unchanged): ${skippedProducts}`);
    console.log(`Products Queued for Upsert: ${productsToUpsertCount}`);
    console.log(`Products Upserted (New/Changed): ${totalWritesToday}`); // Actual writes reflect upserted count
    console.log(`Final Write Count: ${totalWritesToday} / ${DAILY_WRITE_LIMIT}`);
    console.log(`Errors (Processing/Fetch/Upsert): ${errorCount}`);
    console.log("--------------------");

    // 5. Return Response
    return NextResponse.json({
      status: status,
      shopifyFetched: fetchedProducts,
      processed: processedProducts,
      skippedUnchanged: skippedProducts,
      queuedForUpsert: productsToUpsertCount,
      upserted: totalWritesToday, // Use actual writes as the upserted count
      errors: errorCount,
      writeLimit: DAILY_WRITE_LIMIT,
    });

  } catch (err: unknown) { // Catch errors from initial setup, Shopify fetch, or fatal comparison/upsert errors
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Sync failed catastrophically:', errorMessage);
     const isConfigError = errorMessage.includes('Upstash index configuration mismatch');
     const finalStatus = 500;
     const responseErrorMessage = isConfigError
        ? 'Sync failed due to Upstash index configuration error. Check server logs.'
        : 'Sync failed due to an unexpected error. Check server logs.';

    return NextResponse.json(
      {
        error: responseErrorMessage,
        details: errorMessage,
        totalWrites: totalWritesToday,
        writeLimit: DAILY_WRITE_LIMIT,
        status: 'failed'
      },
      { status: finalStatus }
    );
  }
}