import { SupportedLanguage } from './LanguageDetectionService';

const INDIRECT_REFUSAL_PATTERNS = [
    /might be (a )?(bit )?difficult/i,
    /could be challenging/i,
    /not sure (if|we can)/i,
    /maybe later/i,
    /let me think about it/i,
];

const LANG_NAMES: Record<SupportedLanguage, string> = {
    en: 'English',
    lg: 'Luganda',
    ja: 'Japanese',
};

export class CulturalHintsService {
    public static detectHint(text: string, sourceLang: SupportedLanguage, targetLang: SupportedLanguage): string | null {
        if (sourceLang === 'en' && targetLang === 'ja') {
            if (INDIRECT_REFUSAL_PATTERNS.some((pattern) => pattern.test(text))) {
                return 'In Japanese communication, expressing difficulty this way often implies a polite refusal. Consider asking for an alternative instead of pushing for confirmation.';
            }
        }

        if (sourceLang === 'ja' && targetLang === 'en') {
            if (/検討|難しい|厳しい/.test(text)) {
                return 'This phrasing in Japanese often signals indirect disagreement. The speaker may be declining without saying "no" directly.';
            }
        }

        if (sourceLang === 'lg' && targetLang === 'ja') {
            if (/webale nyo/i.test(text)) {
                return 'Luganda gratitude expressions can be warmer and more personal than typical Japanese business tone. Consider matching formality level in your reply.';
            }
        }

        return null;
    }

    public static getLanguageName(code: SupportedLanguage): string {
        return LANG_NAMES[code] ?? code;
    }
}
