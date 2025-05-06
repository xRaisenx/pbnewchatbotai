'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  FaPaperPlane,
  FaPlus,
  FaTimes,
  FaTrashAlt,
  FaCommentDots /* Import the chat icon */
} from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';
import { addToCart } from '../lib/shopify';
import styles from '../styles/ChatInterface.module.css';
import {
  ChatMessage,
  Message
} from './ChatMessage';

// Example suggested questions
const suggestedQuestions = [
  "What’s the best moisturizer for dry skin?",
  "Can you recommend a sulfate-free shampoo?",
  "Show me vegan lipsticks under $20."
];

const welcomeMessageText =
  process.env.NEXT_PUBLIC_WELCOME_MESSAGE ||
  "Welcome! How can I help you find beauty products today?";

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cartId, setCartId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [randomQuestion, setRandomQuestion] = useState(suggestedQuestions[0]); // Default to first question

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatWidgetRef = useRef<HTMLDivElement>(null); // Ref for the main widget container

  // Generate random question only on client side after hydration
  const getRandomQuestion = useCallback(() => {
    if (typeof window !== 'undefined') {
      const randomIndex = Math.floor(Math.random() * suggestedQuestions.length);
      return suggestedQuestions[randomIndex];
    }
    return suggestedQuestions[0]; // Fallback for SSR
  }, []);

  // Set random question on client-side mount
  useEffect(() => {
    setRandomQuestion(getRandomQuestion());
  }, [getRandomQuestion]);

  const createWelcomeMessage = useCallback((): Message => {
    return {
      id: uuidv4(),
      role: 'bot',
      advice: welcomeMessageText,
    };
  }, []); // Removed welcomeMessageText from dependencies

  const updateButtons = useCallback(() => {
    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    const newBtn = document.getElementById('new-btn') as HTMLButtonElement;
    const hasMessages = messages.length > 1;
    if (clearBtn) clearBtn.disabled = !hasMessages;
    if (newBtn) newBtn.disabled = !hasMessages;
  }, [messages]); // Added messages as dependency

  useEffect(() => {
    setMessages([createWelcomeMessage()]);
  }, [createWelcomeMessage]);

  useEffect(() => {
    if (chatAreaRef.current && isOpen) {
      chatAreaRef.current.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
      inputRef.current?.focus();
    }
    updateButtons();
  }, [messages, isOpen, updateButtons]);

  // Effect to handle clicks outside the chatbox to minimize
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatWidgetRef.current && !chatWidgetRef.current.contains(event.target as Node) && isOpen) {
        setIsOpen(false);
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);

    // Clean up event listener on component unmount
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]); // Re-run effect if isOpen changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleAddToCart = useCallback(async (variantId: string) => {
    try {
      const { cartId: newCartId, checkoutUrl, userErrors } = await addToCart(cartId, variantId, 1);
      if (userErrors.length > 0) {
        console.error('Cart errors:', userErrors);
        alert(`Failed to add product to cart: ${userErrors.map(e => e.message).join(', ')}`);
        return;
      }
      if (!newCartId) {
        throw new Error('No cart ID returned.');
      }
      setCartId(newCartId);
      console.log(`Product added to cart: ${newCartId}`);
      if (checkoutUrl) {
        alert('Product added to cart! Proceed to checkout?');
        window.open(checkoutUrl, '_blank');
      } else {
        alert('Product added to cart!');
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
      alert('Sorry, there was an error adding the product to your cart.');
    }
  }, [cartId]);

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmedText = messageText.trim();
    if (!trimmedText || isLoading) return;

    const userMessageId = uuidv4();
    const userMessage: Message = { id: userMessageId, role: 'user', text: trimmedText };

    const loadingMessageId = uuidv4();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: loadingMessageId, role: 'bot', isLoading: true }
    ]);
    setInput('');
    setIsLoading(true);

    try {
      const historyToSend = messages
        .filter(m => !m.isLoading && !m.isError)
        .slice(-6)
        .map(({ ...rest }) => rest);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmedText, history: historyToSend }),
      });

      let data: Message | { error: string };
      if (!response.ok) {
        try { data = await response.json(); }
        catch { data = { error: `API error: ${response.status} ${response.statusText}` }; }
        throw new Error((data as { error: string }).error || 'API request failed');
      }

      data = await response.json();
      console.log('Received API response:', data);

      setMessages((prev) => [
        ...prev.filter(msg => msg.id !== loadingMessageId),
        { ...(data as Message), id: uuidv4(), role: 'bot' }
      ]);
    } catch (error) {
      console.error('Failed to send/process message:', error);
      setMessages((prev) => [
        ...prev.filter(msg => msg.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'bot',
          isError: true,
          text: `Sorry, something went wrong. Please try again. ${error instanceof Error ? `(${error.message.substring(0, 100)})` : ''}`
        }
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      updateButtons();
    }
  }, [isLoading, messages, updateButtons]);

  const handleSendClick = () => { sendMessage(input); };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      sendMessage(input);
    }
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    setTimeout(() => sendMessage(question), 0);
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const clearChat = useCallback(() => {
    setMessages([createWelcomeMessage()]);
    setInput('');
    inputRef.current?.focus();
    updateButtons();
  }, [createWelcomeMessage, updateButtons]);

  const newConversation = useCallback(() => {
    setMessages([createWelcomeMessage()]);
    setInput('');
    inputRef.current?.focus();
    updateButtons();
  }, [createWelcomeMessage, updateButtons]);

  return (
    <div ref={chatWidgetRef} className={styles.widget}> {/* Attach ref to the main widget div */}
      {/* Toggle button - visible when chat is minimized */}
      {!isOpen && (
        <button
          className={styles.toggle}
          onClick={toggleChat}
          aria-label="Open chat"
        >
          <FaCommentDots size={24} /> {/* Use a chat icon */}
        </button>
      )}

      {/* Chat container - visible when chat is open */}
      <div className={`${styles.container} ${isOpen ? styles.open : ''}`}>
        <div className={styles.header}>
          <span>Planet Beauty AI ✨</span>
          {/* Close button - visible when chat is open */}
          {isOpen && (
            <button
              className={styles.iconButton}
              onClick={toggleChat}
              aria-label="Close chat"
            >
              <FaTimes size={24} color="#FFFFFF" /> {/* White close icon */}
            </button>
          )}
        </div>
        <div className={styles.controls}>
          <button
            id="clear-btn"
            className={`${styles.controlBtn} flex items-center px-3 py-1 text-xs rounded-full bg-pink-400 text-white hover:bg-pink-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors`}
            onClick={clearChat}
            disabled={messages.length <= 1}
            aria-label="Clear chat"
          >
            <FaTrashAlt size={12} className="mr-1" />
            Clear Chat
          </button>
          <button
            id="new-btn"
            className={`${styles.controlBtn} flex items-center px-3 py-1 text-xs rounded-full bg-pink-400 text-white hover:bg-pink-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors`}
            onClick={newConversation}
            disabled={messages.length <= 1}
            aria-label="Start new conversation"
          >
            <FaPlus size={12} className="mr-1" />
            New Conversation
          </button>
        </div>
        <div ref={chatAreaRef} className={`${styles.area} flex-1 p-4 overflow-y-auto bg-gray-100 dark:bg-gray-800`}>
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onAddToCart={handleAddToCart} />
          ))}
        </div>
        {messages.length <= 1 && !isLoading && (
          <div className={`${styles.examples} flex flex-wrap gap-2 p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900`}>
            <button
              onClick={() => handleExampleClick(randomQuestion)}
              className={`${styles.chip} px-3 py-1 text-xs rounded-full bg-pink-400 text-white hover:bg-pink-600 transition-colors`}
              aria-label={`Ask: ${randomQuestion}`}
            >
              {randomQuestion}
            </button>
          </div>
        )}
        <div className={`${styles.inputArea} flex items-center p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 gap-2`}>
          <input
            ref={inputRef}
            className={`${styles.input} flex-1 px-3 py-2 border border-gray-300 rounded-full text-sm outline-none focus:border-pink-600 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-pink-600`}
            type="text"
            placeholder="Ask about beauty products..."
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            autoComplete="off"
            aria-label="Type your beauty question"
          />
          <button
            id="send-btn"
            className={`${styles.iconButton} ${styles.sendBtn} p-2 rounded-full text-pink-600 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors`}
            onClick={handleSendClick}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <FaPaperPlane size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
