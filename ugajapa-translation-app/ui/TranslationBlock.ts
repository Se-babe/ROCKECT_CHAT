import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { SupportedLanguage } from '../services/LanguageDetectionService';
import { buildCulturalHintText } from './CulturalHintBlock';

const LANG_LABELS: Record<SupportedLanguage, string> = {
    en: 'English',
    lg: 'Luganda',
    ja: 'Japanese',
};

export interface TranslationDisplay {
    translation: string;
    sourceLang: SupportedLanguage;
    targetLang: SupportedLanguage;
    culturalHint: string | null;
}

export function buildTranslationAttachment(data: TranslationDisplay): IMessageAttachment {
    const header = `Translation (${LANG_LABELS[data.sourceLang]} → ${LANG_LABELS[data.targetLang]})`;
    let text = `${header}\n${data.translation}`;

    if (data.culturalHint) {
        text += `\n\n${buildCulturalHintText(data.culturalHint)}`;
    }

    return {
        color: '#1d74f5',
        title: { value: 'UgaJapa Translation' },
        text,
        collapsed: false,
    };
}
