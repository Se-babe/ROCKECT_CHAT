export type SupportedLanguage = 'en' | 'lg' | 'ja';

const LUGANDA_MARKERS = [
    'webale', 'oli otya', 'wasuze', 'gyebale', 'nze', 'ggwe', 'tuli', 'nkola',
    'bulungi', 'mukama', 'ssebo', 'nyabo', 'kale', 'nnyabo', 'jangu',
];

export class LanguageDetectionService {
    public static detect(text: string): SupportedLanguage {
        const normalized = text.toLowerCase().trim();

        if (this.hasJapaneseCharacters(text)) {
            return 'ja';
        }

        if (LUGANDA_MARKERS.some((word) => normalized.includes(word))) {
            return 'lg';
        }

        return 'en';
    }

    private static hasJapaneseCharacters(text: string): boolean {
        return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text);
    }
}
