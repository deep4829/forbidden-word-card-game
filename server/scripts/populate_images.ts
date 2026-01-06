
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
    process.exit(1);
}

if (!unsplashKey) {
    console.error("Missing Unsplash Access Key. Set UNSPLASH_ACCESS_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface UnsplashResponse {
    results: {
        urls: {
            regular: string;
        };
    }[];
}

async function fetchImageForWord(word: string): Promise<string | null> {
    try {
        const response = await fetch(`https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(word)}&per_page=1&orientation=landscape`, {
            headers: {
                'Authorization': `Client-ID ${unsplashKey}`
            }
        });

        if (!response.ok) {
            console.error(`Unsplash API error for ${word}: ${response.statusText}`);
            return null;
        }

        const data = (await response.json()) as UnsplashResponse;
        if (data.results && data.results.length > 0) {
            return data.results[0].urls.regular;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching image for ${word}:`, error);
        return null;
    }
}

async function populateImages() {
    console.log("Starting image population...");

    // Get cards with missing images
    // Note: We check if image_url is null
    const { data: cards, error } = await supabase
        .from('cards')
        .select('id, main_word, image_url')
        .is('image_url', null);

    if (error) {
        console.error("Error fetching cards:", error);
        return;
    }

    console.log(`Found ${cards.length} cards without images.`);

    for (const card of cards) {
        const word = card.main_word;
        console.log(`Processing: ${word}...`);

        const imageUrl = await fetchImageForWord(word);

        if (imageUrl) {
            const { error: updateError } = await supabase
                .from('cards')
                .update({ image_url: imageUrl })
                .eq('id', card.id);

            if (updateError) {
                console.error(`Failed to update card ${word}:`, updateError);
            } else {
                console.log(`Updated ${word} with image.`);
            }
        } else {
            console.log(`No image found for ${word}.`);
        }

        // Rate limiting (Unsplash free tier is 50 requests/hour usually, ensuring we don't blast it)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Done!");
}

populateImages();
