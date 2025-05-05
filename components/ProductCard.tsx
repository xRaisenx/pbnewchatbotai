// components/ProductCard.tsx
import Image from 'next/image';
import styles from '../styles/ChatInterface.module.css';

interface ProductCardProps {
  title: string;
  description: string;
  price: string;
  image: string | null;
  landing_page: string;
  matches?: string;
  onAddToCart?: (productId: string) => void; // Add prop
  productId?: string; // Add productId (assumed to be part of metadata)
  availableForSale?: boolean; // Add availability status
  quantityAvailable?: number; // Add available quantity
}

export function ProductCard({ title, description, price, image, landing_page, matches, onAddToCart, productId, availableForSale, quantityAvailable }: ProductCardProps) {
  return (
    <div className={styles.productCard}>
      {image && (
        <Image
          alt={title}
          loading="lazy"
          width={80}
          height={80}
          className={styles.productImage}
          src={image}
          sizes="(max-width: 768px) 80px, 80px"
        />
      )}
      <div className={styles.productInfo}>
        <h3 className={styles.productTitle}>{title}</h3>
        <p className={styles.productDescription}>{description}</p>
        <p className={styles.productPrice}>{price}</p>
        {availableForSale === false && (
            <p className={styles.outOfStock}>Out of Stock</p>
        )}
        {availableForSale === true && quantityAvailable !== undefined && quantityAvailable <= 5 && (
             <p className={styles.lowStock}>Low Stock: {quantityAvailable} left!</p>
        )}
        <div className={styles.productActions}>
          <a
            href={landing_page}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.viewProduct}
          >
            View Product
          </a>
          <button
            className={styles.addToCartButton}
            onClick={() => productId && onAddToCart && onAddToCart(productId)}
            disabled={!productId || !onAddToCart || availableForSale === false} // Disable if out of stock
          >
            Add to Cart
          </button>
        </div>
        {matches && <p className={styles.productMatches}>{matches}</p>}
      </div>
    </div>
  );
}
