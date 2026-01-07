// @ts-ignore
import translate from '@iamtraction/google-translate';

interface TranslationResult {
    en: string;
    hi: string;
    kn: string;
}

export async function translateWord(word: string): Promise<TranslationResult> {
    try {
        const [resEn, resHi, resKn] = await Promise.all([
            translate(word, { to: 'en' }),
            translate(word, { to: 'hi' }),
            translate(word, { to: 'kn' })
        ]);

        return {
            en: resEn.text,
            hi: resHi.text,
            kn: resKn.text
        };
    } catch (error) {
        console.error(`Translation error for ${word}:`, error);
        return { en: word, hi: word, kn: word };
    }
}
