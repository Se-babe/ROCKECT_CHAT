import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { RoomLanguageService } from '../services/RoomLanguageService';
import { SupportedLanguage } from '../services/LanguageDetectionService';

export class SetLanguageCommand implements ISlashCommand {
    public command = 'set-language';
    public i18nParamsExample = 'ja | en | lg';
    public i18nDescription = 'Set translation target language for this channel';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const lang = context.getArguments()[0]?.toLowerCase() as SupportedLanguage;
        const valid: SupportedLanguage[] = ['en', 'lg', 'ja'];

        if (!valid.includes(lang)) {
            await this.notify(context, modify, '❌ Usage: `/set-language ja` | `en` | `lg`');
            return;
        }

        await RoomLanguageService.setLanguage(persis, context.getRoom().id, lang);

        const names: Record<SupportedLanguage, string> = {
            ja: 'Japanese 🇯🇵',
            en: 'English 🇺🇬',
            lg: 'Luganda 🇺🇬',
        };

        await this.notify(context, modify, `✅ Translation target set to *${names[lang]}* for this channel.`);
    }

    private async notify(ctx: SlashCommandContext, modify: IModify, text: string): Promise<void> {
        const builder = modify.getNotifier().getMessageBuilder()
            .setText(text)
            .setRoom(ctx.getRoom());
        await modify.getNotifier().notifyUser(ctx.getSender(), builder.getMessage());
    }
}
