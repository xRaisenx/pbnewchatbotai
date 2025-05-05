interface CartResponse {
  cartId: string | null;
  checkoutUrl: string | null;
  userErrors: { message: string }[];
}

export async function addToCart(
  cartId: string | null,
  variantId: string,
  quantity: number
): Promise<CartResponse> {
  const storeName = process.env.SHOPIFY_STORE_NAME;
  const storefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!storeName || !storefrontAccessToken) {
    throw new Error('Shopify environment variables are not set.');
  }

  const endpoint = `https://${storeName}/api/2023-10/graphql.json`;
  const query = cartId
    ? `
      mutation {
        cartLinesAdd(cartId: "${cartId}", lines: [{ merchandiseId: "${variantId}", quantity: ${quantity} }]) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            message
          }
        }
      }
    `
    : `
      mutation {
        cartCreate(input: { lines: [{ merchandiseId: "${variantId}", quantity: ${quantity} }] }) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            message
          }
        }
      }
    `;
  const variables = {};

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    const cartData = result.data.cartCreate || result.data.cartLinesAdd;
    return {
      cartId: cartData?.cart?.id || null,
      checkoutUrl: cartData?.cart?.checkoutUrl || null,
      userErrors: cartData?.userErrors || [],
    };
  } catch (error) {
    console.error('Shopify API error:', error);
    return { cartId: null, checkoutUrl: null, userErrors: [{ message: 'Failed to add to cart.' }] };
  }
}