// @ts-ignore
import translate from '@iamtraction/google-translate';

interface TranslationResult {
    hi: string;
    kn: string;
}

export async function translateWord(word: string): Promise<TranslationResult> {
    try {
        const [resHi, resKn] = await Promise.all([
            translate(word, { to: 'hi' }),
            translate(word, { to: 'kn' })
        ]);

        return {
            hi: resHi.text,
            kn: resKn.text
        };
    } catch (error) {
        console.error(`Translation error for ${word}:`, error);
        return { hi: word, kn: word };
    }
}
