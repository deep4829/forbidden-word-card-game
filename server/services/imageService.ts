import { createClient } from '@supabase/supabase-js';

const pexelsKey = process.env.PEXELS_API_KEY || process.env.PEXEL_API_KEY;

interface PexelsPhoto {
    photos: Array<{
        src: {
            original?: string;
            large?: string;
            large2x?: string;
            medium?: string;
            small?: string;
            portrait?: string;
            landscape?: string;
            tiny?: string;
        };
    }>;
}

export async function fetchImageForWord(word: string): Promise<string | null> {
    if (!pexelsKey) {
        console.error("Missing Pexels API Key. Set PEXELS_API_KEY in .env");
        return null; // Or throw error depending on desired behavior
    }

    try {
        const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(word)}&per_page=1&orientation=landscape`, {
            headers: {
                'Authorization': `${pexelsKey}`
            }
        });

        if (!response.ok) {
            console.error(`Pexels API error for ${word}: ${response.statusText}`);
            return null;
        }

        const data = (await response.json()) as PexelsPhoto;
        if (data.photos && data.photos.length > 0) {
            // prefer large, then landscape, then original
            const src = data.photos[0].src;
            return src.large || src.landscape || src.original || src.medium || null;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching image for ${word}:`, error);
        return null;
    }
}
