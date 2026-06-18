import { IHttp, IMessageExtender, IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { ClaudeTranslationService } from '../services/ClaudeTranslationService';
import { LanguageDetectionService, SupportedLanguage } from '../services/LanguageDetectionService';
import { RoomLanguageService } from '../services/RoomLanguageService';

export class TranslationHandler {
    public static async execute(
        message: IMessage,
        extend: IMessageExtender,
        read: IRead,
        http: IHttp,
    ): Promise<IMessage> {
        try {
            const text = message.text?.trim();
            if (!text) return message;
            if (text.length < 3) return message;

            const sourceLang = LanguageDetectionService.detect(text);
            const roomTargetLang = await RoomLanguageService.getLanguage(read, message.room.id);

            let targetLang: SupportedLanguage;
            if (sourceLang === 'ja') {
                targetLang = 'en';
            } else {
                targetLang = (roomTargetLang as SupportedLanguage) || 'ja';
            }

            if (sourceLang === targetLang) return message;

            const autoTranslate = await read.getEnvironmentReader()
                .getSettings().getValueById('ugajapa_auto_translate') as boolean;
            if (autoTranslate === false) return message;

            const apiKey = await read.getEnvironmentReader()
                .getSettings().getValueById('ugajapa_claude_api_key') as string;

            if (!apiKey || !apiKey.trim()) {
                extend.addAttachment({
                    color: '#F4A523',
                    text: `Demo mode — no API key set.`,
                    collapsed: false,
                });
                return extend.getMessage();
            }

            const result = await ClaudeTranslationService.translate({
                text,
                sourceLang,
                targetLang,
                apiKey,
                http,
            });

            const langFlag: Record<SupportedLanguage, string> = {
                en: 'EN',
                lg: 'LG',
                ja: 'JA',
            };

            const attachText =
                `📝 *Original (${langFlag[sourceLang]}):* ${text}\n` +
                `🌐 *[${langFlag[sourceLang]} → ${langFlag[targetLang]}]:* ${result.translation}\n\n` +
                `*Was this translation helpful?*  ✅ Good  👎 Poor  ⚠️ Inaccurate\n` +
                `_React with an emoji above to evaluate this translation_`;

            extend.addAttachment({
                color: '#1D9E75',
                text: attachText,
                collapsed: false,
            });

        } catch (err) {
            extend.addAttachment({
                color: '#E53935',
                text: `❌ *Translation failed:* ${err}`,
                collapsed: false,
            });
        }

        return extend.getMessage();
    }
}
