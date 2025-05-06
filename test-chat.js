import fetch from 'node-fetch';

const userQueries = [
    "What's a good cleanser for oily skin?",
    "Can you recommend a moisturizer too?",
    "What about a sunscreen?",
    "Is there a gentle exfoliator you recommend?",
    "What's the best serum for brightening?",
    "Any suggestions for an eye cream?",
    "Can you recommend a toner for sensitive skin?",
    "What's a good face mask for hydration?",
    "Do you know a spot treatment for acne?",
    "What's the best makeup remover?",
    "Can you suggest a lip balm for dry lips?",
    "What's a good night cream?",
    "Any recommendations for anti-aging products?",
    "What's a lightweight foundation for daily use?",
    "Can you suggest a primer for oily skin?",
    "What's a good setting spray?",
    "Do you know a gentle face scrub?",
    "What's a good cleanser for dry skin?",
    "Can you recommend a moisturizer for combination skin?",
    "What's the best sunscreen for sensitive skin?",
    "Any tips for minimizing pores?",
    "What's a good face oil?",
    "Can you suggest a clay mask?",
    "What's the best product for redness?",
    "Any recommendations for dark circles?",
    "What's a good cleanser for acne-prone skin?",
    "Can you recommend a fragrance-free moisturizer?",
    "What's the best sunscreen for under makeup?",
    "Any suggestions for a vitamin C serum?",
    "What's a good retinol product for beginners?",
    "Can you recommend a gentle cleanser for morning use?",
    "What's the best moisturizer for nighttime?",
    "Any suggestions for a hydrating toner?",
    "What's a good SPF for daily use?",
    "Can you recommend a face mist?",
    "What's the best product for hyperpigmentation?",
    "Any tips for soothing irritated skin?",
    "What's a good cleanser for sensitive skin?",
    "Can you recommend a lightweight moisturizer?",
    "What's the best sunscreen for oily skin?",
    "Any suggestions for a calming serum?",
    "What's a good product for blackheads?",
    "Can you recommend a moisturizer with SPF?",
    "What's the best face wash for men?",
    "Any recommendations for a gentle exfoliating pad?",
    "What's a good cleansing balm?",
    "Can you recommend a moisturizer for mature skin?",
    "What's the best sunscreen for body?",
    "Any tips for dealing with flaky skin?",
    "What's a good face mask for brightening?"
];


async function testChat() {
    for (let i = 0; i < userQueries.length; i++) {
        const query = userQueries[i];
        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const data = await response.json();
            console.log(`Test ${i + 1}: Query: "${query}"`);
            console.log('Response:', JSON.stringify(data, null, 2));
            console.log('---');
        } catch (error) {
            console.error(`Test ${i + 1} Error:`, error);
        }
    }
}

testChat();