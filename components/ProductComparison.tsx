// components/ProductComparison.tsx
'use client';

import React from 'react';
import { ProductCardResponse } from '../app/api/chat/route'; // Import the interface

interface ProductComparisonProps {
  products: ProductCardResponse[];
}

export function ProductComparison({ products }: ProductComparisonProps) {
  if (!products || products.length === 0) {
    return null; // Don't render if no products to compare
  }

  return (
    <div className="product-comparison-container border-t border-border-light dark:border-border-dark pt-3 mt-3">
      <h3 className="text-lg font-semibold mb-2">Product Comparison</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Comparison details will appear here once provided by the AI.</p> {/* Added placeholder text */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((product, index) => (
          <div key={index} className="border border-gray-300 dark:border-gray-600 p-3 rounded-md">
            <h4 className="text-md font-semibold mb-1">{product.title}</h4>
            {/* TODO: Display key attributes for comparison */}
            <p className="text-sm text-gray-600 dark:text-gray-400">{product.description}</p>
            <p className="text-sm font-bold mt-1">{product.price}</p>
            {/* Add more comparison details here */}
          </div>
        ))}
      </div>
      {/* TODO: Add a summary or key differences */}
    </div>
  );
}
