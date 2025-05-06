// --- Interfaces for Type Safety (Admin API) ---

interface AdminShopifyImageNode {
  url: string;
  altText?: string | null;
}

interface AdminShopifyPrice {
  amount: string;
  currencyCode: string;
}

export interface AdminShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  onlineStoreUrl: string | null;
  images: {
      edges: { node: AdminShopifyImageNode }[];
  };
  priceRange: {
      minVariantPrice: AdminShopifyPrice;
      maxVariantPrice: AdminShopifyPrice;
  };
  variants?: {
      edges: { node: { id: string } }[];
  };
}

export interface AdminShopifyPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// --- Fetch Products Function (Admin API using direct HTTP request) ---

export interface AdminFetchResult {
  products: AdminShopifyProductNode[];
  pageInfo: AdminShopifyPageInfo;
}


export async function fetchAdminShopifyProducts(
  cursor: string | null = null,
  limit: number = 50,
  queryFilter: string | null = "status:active"
): Promise<AdminFetchResult> {
  const storeDomain = process.env.SHOPIFY_STORE_NAME;
  const adminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!adminAccessToken || !storeDomain) {
      console.error("CRITICAL: Missing Shopify Admin credentials (SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_ACCESS_TOKEN).");
      throw new Error('Shopify Admin credentials are not configured.');
  }

  console.log(`Fetching Shopify Admin products via REST... Limit: ${limit}, After: ${cursor || 'Start'}, Filter: "${queryFilter || 'None'}"`);

  try {
      // Construct the REST API URL
      const apiVersion = '2024-01'; // Use a specific version for stability
      let url = `https://${storeDomain}/admin/api/${apiVersion}/products.json?limit=${limit}`;
      if (cursor) url += `&after=${encodeURIComponent(cursor)}`;
      if (queryFilter) url += `&query=${encodeURIComponent(queryFilter)}`;

      // Make the HTTP request
      const response = await fetch(url, {
          method: 'GET',
          headers: {
              'X-Shopify-Access-Token': adminAccessToken,
              'Content-Type': 'application/json',
          },
      });

      if (!response.ok) {
          const errorText = await response.text();
          console.error(`Shopify Admin REST API error: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Shopify Admin REST API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const productsData = data.products;

      if (!Array.isArray(productsData)) {
          console.error("Invalid response structure from Shopify Admin REST API:", data);
          throw new Error("Received invalid data structure from Shopify Admin REST API.");
      }

interface AdminProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  images: { src: string; alt: string }[];
  variants: { id: number; price: string; currency_code: string }[];
}

      const products: AdminShopifyProductNode[] = productsData.map((p: AdminProduct) => ({
          id: `gid://shopify/Product/${p.id}`,
          handle: p.handle,
          title: p.title,
          descriptionHtml: p.body_html,
          vendor: p.vendor || null,
          productType: p.product_type || null,
          tags: p.tags ? p.tags.split(', ').filter((tag: string) => tag) : [],
          onlineStoreUrl: null, // REST API doesn't provide this directly
          images: {
              edges: p.images
                  ? p.images.map((img: { src: string; alt: string }) => ({
                        node: { url: img.src, altText: img.alt || null },
                    }))
                  : [],
          },
          priceRange: {
              minVariantPrice: {
                  amount: p.variants[0]?.price || '0.0',
                  currencyCode: p.variants[0]?.currency_code || 'USD',
              },
              maxVariantPrice: {
                  amount: p.variants[0]?.price || '0.0',
                  currencyCode: p.variants[0]?.currency_code || 'USD',
              },
          },
          variants: {
              edges: p.variants
                  ? p.variants.map((v: { id: number }) => ({
                        node: { id: `gid://shopify/ProductVariant/${v.id}` },
                    }))
                  : [],
          },
      }));

      // Extract pagination info (Shopify REST API uses Link headers)
      const linkHeader = response.headers.get('Link');
      let hasNextPage = false;
      let endCursor: string | null = null;
      if (linkHeader) {
          const nextLink = linkHeader.split(',').find((link: string) => link.includes('rel="next"'));
          if (nextLink) {
              hasNextPage = true;
              const match = nextLink.match(/page_info=([^&>]+)/);
              endCursor = match ? match[1] : null;
          }
      }

      const pageInfo: AdminShopifyPageInfo = { hasNextPage, endCursor };

      console.log(` -> Fetched ${products.length} products. HasNextPage: ${pageInfo.hasNextPage}`);

      return {
          products,
          pageInfo,
      };
  } catch (err) {
      console.error("Error during Shopify Admin REST fetch:", err);
      throw err;
  }
}
