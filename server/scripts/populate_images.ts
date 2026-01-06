
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pexelsKey = process.env.PEXELS_API_KEY || process.env.PEXEL_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
    process.exit(1);
}

if (!pexelsKey) {
    console.error("Missing Pexels API Key. Set PEXELS_API_KEY in .env.local or PEXEL_API_KEY environment variable");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function fetchImageForWord(word: string): Promise<string | null> {
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

async function populateImages() {
    console.log("Starting image population...");

    // Get cards with missing images (main OR forbidden)
    const { data: cards, error } = await supabase
        .from('cards')
        .select('id, main_word, forbidden_words, image_url, forbidden_word_image_urls');

    // We filter client-side because checking for *either* missing main image OR missing forbidden images 
    // in Supabase query is tricky with is('image_url', null) AND array checks.
    // Simple check: if image_url is missing OR forbidden_word_image_urls is missing/empty
    const cardsToProcess = cards?.filter((card: any) =>
        !card.image_url ||
        !card.forbidden_word_image_urls ||
        card.forbidden_word_image_urls.length !== card.forbidden_words.length
    ) || [];

    if (error) {
        console.error("Error fetching cards:", error);
        return;
    }

    console.log(`Found ${cardsToProcess.length} cards needing updates.`);

    for (const card of cardsToProcess) {
        const word = card.main_word;
        console.log(`Processing card: ${word}...`);

        const updates: any = {};
        let needsUpdate = false;

        // 1. Main Word Image
        if (!card.image_url) {
            const imageUrl = await fetchImageForWord(word);
            if (imageUrl) {
                updates.image_url = imageUrl;
                needsUpdate = true;
                console.log(`  - Found main image for ${word}`);
            } else {
                console.log(`  - No main image found for ${word}`);
            }
        }

        // 2. Forbidden Word Images
        // Check if we need to fetch forbidden images
        const currentForbiddenImages = card.forbidden_word_image_urls || [];
        if (currentForbiddenImages.length !== card.forbidden_words.length) {
            console.log(`  - Fetching forbidden images (${card.forbidden_words.length} words)...`);
            const newForbiddenImages: string[] = [];

            for (const fWord of card.forbidden_words) {
                // Check if we effectively already have it? 
                // Simpler: Just re-fetch all for consistency or fetch missing. 
                // For robustness, let's fetch all 5 again to ensure order matches exactly.
                // (Optimization: could check if we already have N images and they match, but typically this is a one-off script)

                const fImage = await fetchImageForWord(fWord);
                if (fImage) {
                    newForbiddenImages.push(fImage);
                } else {
                    newForbiddenImages.push(""); // Placeholder or keep empty? Empty string better than null for text[]
                    console.log(`  - No image found for forbidden word: ${fWord}`);
                }
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            updates.forbidden_word_image_urls = newForbiddenImages;
            needsUpdate = true;
        }

        if (needsUpdate) {
            const { error: updateError } = await supabase
                .from('cards')
                .update(updates)
                .eq('id', card.id);

            if (updateError) {
                console.error(`Failed to update card ${word}:`, updateError);
            } else {
                console.log(`Updated ${word} successfully.`);
            }
        }

        // Rate limiting between cards
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Done!");
}

populateImages();

