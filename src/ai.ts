import Groq from "groq-sdk";
import type { TokenData, DiscoveredNarrative } from "./types.js";
import { sendTelegram, escapeHtml } from "./telegram.js";

export async function discoverNarrativesWithAI(tokens: TokenData[]): Promise<DiscoveredNarrative[]> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error("❌ GROQ_API_KEY not set in .env — cannot discover narratives");
        console.error("   Get a free key at: https://console.groq.com/keys");
        process.exit(1);
    }

    const groq = new Groq({ apiKey });

    const tokenList = tokens
        .map((t) => `${t.symbol} (${t.name})`)
        .join(", ");

    const systemPrompt = `You are a meme coin narrative analyst. You analyze lists of Solana meme tokens and identify STRONG narrative themes. You always respond with valid JSON only.`;

    const userPrompt = `Analyze the following list of Solana meme tokens and identify STRONG narrative themes — groups of 3 or more tokens that share a common theme or trend.

TOKEN LIST:
${tokenList}

INSTRUCTIONS:
1. Identify distinct narrative themes (e.g., "Dog Coins", "AI Tokens", "Political Memes", "Frog/Pepe Variants", etc.)
2. Each narrative must have AT LEAST 3 matching tokens from the list
3. A token can only belong to ONE narrative (choose the best fit)
4. For each narrative, suggest a creative token name and 3-5 letter symbol for a reactive token that could be minted in response
5. Rate each narrative with a "confidence" score from 1-10 based on:
   - How many tokens match (more = higher)
   - How clearly the theme is defined (clearer = higher)
   - How trendy/viral the narrative feels (hotter = higher)
6. Only return narratives you are confident about — quality over quantity

Respond with ONLY valid JSON using this exact schema:
{
  "narratives": [
    {
      "name": "Narrative Theme Name",
      "description": "Brief exciting description of why this narrative is trending (include an emoji)",
      "tokenName": "SuggestedTokenName",
      "symbol": "SYM",
      "confidence": 8,
      "matchingTokens": ["TOKEN1", "TOKEN2", "TOKEN3"]
    }
  ]
}

If no strong narratives are found (fewer than 3 tokens matching any theme), return: { "narratives": [] }`;

    console.log("\n🤖 Asking Groq (Llama 3.3 70B) to analyze token narratives...");

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.3,
                max_tokens: 2048,
                response_format: { type: "json_object" },
            });

            const responseText = completion.choices[0]?.message?.content?.trim() || "";

            let jsonStr = responseText;
            if (jsonStr.startsWith("```")) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
            }

            const parsed = JSON.parse(jsonStr);
            const narratives: DiscoveredNarrative[] = Array.isArray(parsed) ? parsed : (parsed.narratives || parsed.data || []);

            if (!Array.isArray(narratives)) {
                console.log("⚠️  Groq returned invalid format, expected array");
                return [];
            }

            const validNarratives = narratives
                .filter(
                    (n) =>
                        n.name &&
                        n.description &&
                        n.tokenName &&
                        n.symbol &&
                        Array.isArray(n.matchingTokens) &&
                        n.matchingTokens.length >= 3
                )
                .map((n) => ({
                    ...n,
                    confidence: typeof n.confidence === "number" ? Math.min(10, Math.max(1, n.confidence)) : 5,
                }));

            validNarratives.sort((a, b) => b.confidence - a.confidence);

            return validNarratives;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            if (errorMsg.includes("429") && attempt < maxRetries) {
                const waitSeconds = attempt * 10;
                console.log(`   ⏳ Rate limited — retrying in ${waitSeconds}s (attempt ${attempt}/${maxRetries})...`);
                await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
                continue;
            }

            console.error("❌ Groq API error:", errorMsg);
            await sendTelegram(`🚨 <b>Groq AI Error</b>\n<code>${escapeHtml(errorMsg.slice(0, 500))}</code>`);
            return [];
        }
    }

    return [];
}
