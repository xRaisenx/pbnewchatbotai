// components/ChatMessage.tsx
import DOMPurify from 'isomorphic-dompurify';
import { useEffect } from 'react'; // Add useEffect import
import { ProductCardResponse } from '../app/api/chat/route';
import styles from '../styles/ChatInterface.module.css';
import { ComplementaryProducts } from './ComplementaryProducts';
import { KnowledgeBaseDisplay } from './KnowledgeBaseDisplay';
import { ProductCard } from './ProductCard';
import { ProductComparison } from './ProductComparison';

export interface Message {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  ai_understanding?: string;
  product_card?: {
    title: string;
    description: string;
    price: string;
    image: string | null;
    landing_page: string;
    matches?: string;
    variantId: string;
    availableForSale?: boolean;
    quantityAvailable?: number;
  };
  advice?: string;
  isLoading?: boolean;
  isError?: boolean;
  product_comparison?: ProductCardResponse[];
  complementary_products?: ProductCardResponse[];
  knowledge_base_answer?: {
    question_matched: string;
    answer: string;
    source_url?: string;
  } | null;
}

interface ChatMessageProps {
  message: Message;
  onAddToCart: (productId: string, productTitle: string) => void;
}

export function ChatMessage({ message, onAddToCart }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Log ai_understanding only when message.ai_understanding changes
  useEffect(() => {
    if (message.ai_understanding) {
      console.log('AI Understanding:', message.ai_understanding);
    }
  }, [message.ai_understanding]); // Dependency array ensures it runs only when ai_understanding changes

  // Function to parse advice text for legacy PRODUCT_CARD_START/END markers
  const parseAdvice = (advice: string) => {
    const productCardRegex = /PRODUCT_CARD_START(\{.*?\})PRODUCT_CARD_END/;
    const match = advice.match(productCardRegex);
    let cleanedAdvice = advice;
    let parsedProductCard = message.product_card;

    if (match && match[1]) {
      try {
        const productCardData = JSON.parse(match[1]);
        parsedProductCard = {
          title: productCardData.title,
          description: productCardData.description,
          price: productCardData.price,
          image: productCardData.image,
          landing_page: productCardData.landing_page,
          matches: productCardData.matches,
          variantId: productCardData.variantId || productCardData.landing_page.split('/').pop(),
        };
        cleanedAdvice = advice.replace(productCardRegex, '').trim();
      } catch (error) {
        console.error('Failed to parse product card from advice:', error);
      }
    }

    return { cleanedAdvice, parsedProductCard };
  };

  // Sanitize HTML and parse advice
  const sanitizeOptions = { USE_PROFILES: { html: true }, ALLOWED_TAGS: ['b', 'i', 'strong', 'em', 'br', 'p', 'ul', 'ol', 'li'] };
  const { cleanedAdvice, parsedProductCard } = message.advice ? parseAdvice(message.advice) : { cleanedAdvice: '', parsedProductCard: message.product_card };
  const sanitizedAdvice = cleanedAdvice ? DOMPurify.sanitize(cleanedAdvice, sanitizeOptions) : '';
  const sanitizedText = message.text ? DOMPurify.sanitize(message.text, sanitizeOptions) : '';

  // --- Loading Indicator ---
  if (message.isLoading) {
    return (
      <div className={`${styles['message-base']} ${styles['bot-message']} ${styles.messageBubble} flex items-center space-x-2 opacity-80`}>
        <div className={styles.typingIndicator}>
          <span className="typing-dot animate-bounce [animation-delay:-0.3s]"></span>
          <span className="typing-dot animate-bounce [animation-delay:-0.15s]"></span>
          <span className="typing-dot animate-bounce"></span>
        </div>
        <span className="text-sm italic">Bella is thinking...</span>
      </div>
    );
  }

  // --- Error Message Styling ---
  if (message.isError) {
    return (
      <div className={`${styles['message-base']} ${styles['bot-message']} ${styles.messageBubble} bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300`}>
        <p className="font-medium">Oops!</p>
        {sanitizedText && <div dangerouslySetInnerHTML={{ __html: sanitizedText }} />}
      </div>
    );
  }

  // --- Standard User/Bot Message ---
  return (
    <div className={`${styles['message-base']} ${isUser ? styles['user-message'] : styles['bot-message']} ${styles.messageBubble}`}>
      {!isUser && message.ai_understanding && (
        null // Keep this as null if you don’t want to display ai_understanding
        // Optionally, render it conditionally:
        // <div className="text-sm text-gray-500 italic">{message.ai_understanding}</div>
      )}

      {isUser && message.text && (
        <div>{message.text}</div>
      )}

      {!isUser && parsedProductCard && (
        <div className="mt-3 mb-1">
          <ProductCard
            title={parsedProductCard.title}
            description={parsedProductCard.description}
            price={parsedProductCard.price}
            image={parsedProductCard.image}
            landing_page={parsedProductCard.landing_page}
            matches={parsedProductCard.matches}
            productId={parsedProductCard.variantId}
            availableForSale={parsedProductCard.availableForSale}
            quantityAvailable={parsedProductCard.quantityAvailable}
            onAddToCart={(productId) => onAddToCart(productId, parsedProductCard.title)}
          />
        </div>
      )}

      {!isUser && message.product_comparison && message.product_comparison.length > 0 && (
        <div className="mt-3 mb-1">
          <ProductComparison products={message.product_comparison} />
        </div>
      )}

      {!isUser && message.complementary_products && message.complementary_products.length > 0 && (
        <div className="mt-3 mb-1">
          <ComplementaryProducts products={message.complementary_products} />
        </div>
      )}

      {!isUser && message.knowledge_base_answer && (
        <div className="mt-3 mb-1">
          <KnowledgeBaseDisplay answer={message.knowledge_base_answer} />
        </div>
      )}

      {!isUser && sanitizedAdvice && (
        <div className="advice-text" dangerouslySetInnerHTML={{ __html: sanitizedAdvice }} />
      )}
    </div>
  );
}