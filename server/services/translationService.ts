
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

interface TranslationResult {
    hi: string;
    kn: string;
}

export async function translateWord(word: string): Promise<TranslationResult> {
    if (!genAI) {
        console.warn("GEMINI_API_KEY not set. Returning original word.");
        return { hi: word, kn: word };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Translate the English word "${word}" into Hindi and Kannada. 
  Return ONLY a valid JSON object with keys "hi" and "kn". 
  Example: {"hi": "नमस्ते", "kn": "ನಮಸ್ಕಾರ"}. 
  Do not include markdown formatting or backticks.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const json = JSON.parse(text);

        return {
            hi: json.hi || word,
            kn: json.kn || word
        };
    } catch (error) {
        console.error(`Translation error for ${word}:`, error);
        return { hi: word, kn: word };
    }
}
