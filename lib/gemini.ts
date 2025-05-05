// lib/gemini.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY in .env.local.');

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiUnderstandingResponse {
  ai_understanding: string;
  advice: string;
  search_keywords: string;
  is_product_query: boolean;
}

export async function callGeminiForUnderstanding(
  query: string,
  history: ChatHistoryMessage[]
): Promise<GeminiUnderstandingResponse | null> {
  const systemPrompt = `You are Bella, Planet Beauty's expert AI shopping assistant for josedevai.myshopify.com.
Your tasks based on the LATEST user query ("${query}") and conversation history:
1. Analyze the user's core need or question, considering history context.
2. Generate a concise "ai_understanding" summarizing the request in one sentence.
3. Provide helpful, friendly "advice" (e.g., usage tips, recommendations, answers), under 100 words unless a routine is requested. Use markdown lists for routines.
4. Extract "search_keywords" (3-7 terms) for BM25 search ONLY if the query explicitly requests product recommendations (e.g., "recommend a moisturizer", "show me lipsticks"). Focus on product types, attributes, brands, or issues. Return empty string "" for non-product queries (e.g., 'store hours', 'how to apply makeup').
5. Determine if the query is a product recommendation request ("is_product_query": true/false). True only if the user explicitly asks for products (e.g., "suggest a serum", "find a red lipstick"). False for informational or conversational queries.
6. Return ONLY a valid JSON object with keys "ai_understanding", "advice", "search_keywords", and "is_product_query".

Example Input Query: "I need a product to fix my acne pores"
Example Output JSON:
{
  "ai_understanding": "User is looking for a product to address acne pores.",
  "advice": "For acne-prone skin, try a pore-tightening serum or cleanser. Use daily for best results!",
  "search_keywords": "acne pores serum cleanser",
  "is_product_query": true
}

Example Input Query: "What are your store hours?"
Example Output JSON:
{
  "ai_understanding": "User is asking about store operating hours.",
  "advice": "Please check the contact page on the Planet Beauty website for store hours!",
  "search_keywords": "",
  "is_product_query": false
}`;

  const messages = [
    { role: 'model', parts: [{ text: systemPrompt }] },
    ...history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })),
    { role: 'user', parts: [{ text: query }] },
  ];

  try {
    const result = await model.generateContent({
      contents: messages,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.5,
        maxOutputTokens: 350,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });

    const content = result.response.text();
    const parsedJson = JSON.parse(content);

    if (
      parsedJson &&
      typeof parsedJson.ai_understanding === 'string' &&
      typeof parsedJson.advice === 'string' &&
      typeof parsedJson.search_keywords === 'string' &&
      typeof parsedJson.is_product_query === 'boolean'
    ) {
      console.log('Successfully parsed Gemini response.');
      return parsedJson as GeminiUnderstandingResponse;
    } else {
      console.error('Gemini response JSON structure is invalid:', parsedJson);
      throw new Error('Invalid JSON structure from Gemini.');
    }
  } catch (error) {
    console.error('Gemini Error:', error);
    return null;
  }
}
