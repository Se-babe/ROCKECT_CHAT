import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPreMessageSentExtend } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SetLanguageCommand } from './commands/SetLanguageCommand';
import { TranslateCommand } from './commands/TranslateCommand';
import { EvalStatsCommand } from './commands/EvalStatsCommand';
import { TranslationHandler } from './handlers/TranslationHandler';
import { AppSettings } from './settings/AppSettings';

export class UgaJapaTranslationApp extends App implements IPreMessageSentExtend {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        await Promise.all(
            AppSettings.map((setting) => configuration.settings.provideSetting(setting)),
        );
        configuration.slashCommands.provideSlashCommand(new SetLanguageCommand());
        configuration.slashCommands.provideSlashCommand(new TranslateCommand());
        configuration.slashCommands.provideSlashCommand(new EvalStatsCommand());
    }

    public async onEnable(): Promise<boolean> {
        this.getLogger().info('UgaJapa Translation App enabled');
        return true;
    }

    public async checkPreMessageSentExtend(
        message: IMessage,
        read: IRead,
        http: IHttp,
    ): Promise<boolean> {
        const txt = message.text;
        if (!txt || !txt.trim()) return false;
        const cf = message.customFields;
        if (cf && cf.ugajapa_translation) return false;
        return true;
    }

    public async executePreMessageSentExtend(
        message: IMessage,
        extend: import('@rocket.chat/apps-engine/definition/accessors').IMessageExtender,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        return TranslationHandler.execute(message, extend, read, http);
    }
}
