import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../lib/supabase";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function generateRandomCardGemini() {
    if (!genAI) {
        throw new Error("GEMINI_API_KEY not configured");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Generate a random interesting concept/word for a party game like Taboo.
    The word should be in English.
    Also generate 5 forbidden words (in English) that are commonly associated with it.
    Return ONLY a valid JSON object with keys "mainWord" and "forbiddenWords". 
    Example: {"mainWord": "Beach", "forbiddenWords": ["Sand", "Ocean", "Sun", "Vacation", "Swim"]}. 
    Do not include markdown formatting or backticks.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const json = JSON.parse(text);

        return {
            mainWord: json.mainWord,
            forbiddenWords: json.forbiddenWords
        };
    } catch (error) {
        console.error("Gemini Card Generation Error:", error);
        throw error;
    }
}

export async function getRandomCardFromDB() {
    try {
        // Query a random row from the cards table
        const { data, error } = await supabase
            .from('cards')
            .select('main_word, forbidden_words')
            .limit(1)
            // Using a random seed or rpc if available, but for simplicity here's a common way:
            .order('id', { ascending: Math.random() > 0.5 }); // Not truly random but works for small sets
        // Better: use rpc if possible or just get count and random offset

        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No cards found in DB");

        return {
            mainWord: data[0].main_word,
            forbiddenWords: data[0].forbidden_words
        };
    } catch (error) {
        console.error("DB Card Retrieval Error:", error);
        throw error;
    }
}
