import { IHttp, IMessageExtender, IRead } from '@rocket.chat/apps-engine/definition/accessors';
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

            const sourceLang = LanguageDetectionService.detect(text);
            const targetLang = (await RoomLanguageService.getLanguage(read, message.room.id)) || 'ja';

            if (sourceLang === targetLang) return message;

            const apiKey = await read.getEnvironmentReader()
                .getSettings().getValueById('ugajapa_claude_api_key') as string;

            if (!apiKey || !apiKey.trim()) {
                extend.addAttachment({
                    color: '#F4A523',
                    text: `⚠️ *Demo mode* — No NVIDIA API key (nvapi-...).\n🌐 *[${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}]* Run ./scripts/configure-app.sh or add your key in Admin > Apps > UgaJapa Translation > Settings`,
                    collapsed: false,
                });
                return extend.getMessage();
            }

            const result = await ClaudeTranslationService.translate({
                text,
                sourceLang,
                targetLang: targetLang as SupportedLanguage,
                apiKey,
                http,
            });

            const showHints = await read.getEnvironmentReader()
                .getSettings().getValueById('ugajapa_show_hints') as boolean;

            let attachText = `🌐 *[${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}]*\n${result.translation}`;

            if (showHints !== false && result.culturalHint) {
                attachText += `\n\n💡 *Cultural note:*\n${result.culturalHint}`;
            }

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
