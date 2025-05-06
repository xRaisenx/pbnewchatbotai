// components/ComplementaryProducts.tsx
'use client';

import { ProductCardResponse } from '../app/api/chat/route'; // Import the interface
import { ProductCard } from './ProductCard'; // Import ProductCard to potentially reuse

interface ComplementaryProductsProps {
  products: ProductCardResponse[];
}

export function ComplementaryProducts({ products }: ComplementaryProductsProps) {
  if (!products || products.length === 0) {
    return null; // Don't render if no complementary products
  }

  return (
    <div className="complementary-products-container border-t border-border-light dark:border-border-dark pt-3 mt-3">
      <h3 className="text-lg font-semibold mb-2">Suggested Products</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Products will appear here once suggested.</p> {/* Added placeholder text */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((product, index) => (
          // Can reuse ProductCard for displaying complementary products
          <ProductCard
            key={index}
            title={product.title}
            description={product.description}
            price={product.price}
            image={product.image}
            landing_page={product.landing_page}
            productId={product.variantId} // Pass variantId as productId
            // Pass other relevant props if needed
          />
        ))}
      </div>
    </div>
  );
}
