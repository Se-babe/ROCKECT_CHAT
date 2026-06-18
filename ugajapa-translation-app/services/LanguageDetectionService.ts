export type SupportedLanguage = 'en' | 'lg' | 'ja';

const LUGANDA_MARKERS = [
    // Greetings
    'webale', 'oli otya', 'wasuze', 'gyebale', 'osiibye', 'osiibire',
    'waakiri', 'njagala', 'kale', 'eradde',
    // Pronouns
    'nze', 'ggwe', 'ye', 'ffe', 'mmwe', 'abo',
    'nkola', 'tuli', 'muli', 'bali',
    // Common words
    'bulungi', 'bubi', 'nnyabo', 'ssebo', 'mukama',
    'jangu', 'genda', 'jja', 'naye', 'era',
    'kubanga', 'kyokka', 'nga', 'bwe', 'oba',
    'mulimu', 'emirimu', 'ekibiina', 'omulimu',
    // Numbers
    'emu', 'bbiri', 'ssatu', 'nnya', 'ttaano',
    'mukaaga', 'musanvu', 'munaana', 'mwenda', 'kkumi',
    // Time
    'leero', 'jjo', 'enkya', 'bwembi', 'olwomukaaga',
    // Common phrases
    'gyebale ko', 'weebale', 'nsanyuse', 'nkusanyuse',
    'mpozzi', 'nkwagala', 'bambi', 'musawo',
    // Places / culture
    'buganda', 'kampala', 'uganda', 'baganda', 'luganda',
    // Verbs
    'okola', 'okuyiga', 'okubuuza', 'okugenda', 'okujangu',
    'okusoma', 'okukyala', 'okulya', 'okunywa', 'okutuula',
    // Question words
    'ndi', 'ki', 'wa', 'ludda', 'ddi', 'lwaki', 'ngati',
    // Conjunctions / connectors
    'nno', 'si', 'nedda', 'yee', 'ambe',
];

export class LanguageDetectionService {
    public static detect(text: string): SupportedLanguage {
        const normalized = text.toLowerCase().trim();

        // Japanese: check Unicode ranges first (most reliable)
        if (this.hasJapaneseCharacters(text)) {
            return 'ja';
        }

        // Luganda: check for lexical markers
        const wordCount = LUGANDA_MARKERS.filter((word) =>
            normalized.includes(word)
        ).length;

        // If 1 or more Luganda markers found, classify as Luganda
        if (wordCount >= 1) {
            return 'lg';
        }

        // Default to English
        return 'en';
    }

    public static getLanguageName(code: SupportedLanguage): string {
        const names: Record<SupportedLanguage, string> = {
            en: 'English',
            lg: 'Luganda',
            ja: 'Japanese',
        };
        return names[code] ?? code;
    }

    private static hasJapaneseCharacters(text: string): boolean {
        return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text);
    }
}
