import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { ClaudeTranslationService } from '../services/ClaudeTranslationService';
import { LanguageDetectionService, SupportedLanguage } from '../services/LanguageDetectionService';
import { RoomLanguageService } from '../services/RoomLanguageService';

export class TranslateCommand implements ISlashCommand {
    public command = 'translate';
    public i18nParamsExample = '<text to translate>';
    public i18nDescription = 'Translate text without posting it to the channel';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const text = context.getArguments().join(' ').trim();

        if (!text) {
            await this.notify(context, modify, '❌ Usage: `/translate <text>`');
            return;
        }

        const sourceLang = LanguageDetectionService.detect(text);
        const targetLang = (await RoomLanguageService.getLanguage(read, context.getRoom().id)) || 'ja';
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById('ugajapa_claude_api_key') as string;

        try {
            const result = await ClaudeTranslationService.translate({
                text, sourceLang, targetLang: targetLang as SupportedLanguage, apiKey, http,
            });

            let msg = `🌐 *Translation (${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()})*\n${result.translation}`;
            if (result.culturalHint) {
                msg += `\n\n💡 *Cultural note:* ${result.culturalHint}`;
            }

            await this.notify(context, modify, msg);
        } catch (e) {
            await this.notify(context, modify, `❌ Translation failed: ${e}`);
        }
    }

    private async notify(ctx: SlashCommandContext, modify: IModify, text: string): Promise<void> {
        const builder = modify.getNotifier().getMessageBuilder()
            .setText(text)
            .setRoom(ctx.getRoom());
        await modify.getNotifier().notifyUser(ctx.getSender(), builder.getMessage());
    }
}
