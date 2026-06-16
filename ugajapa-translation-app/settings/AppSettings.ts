import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export const AppSettings: ISetting[] = [
    {
        id: 'ugajapa_claude_api_key',
        type: SettingType.PASSWORD,
        packageValue: '',
        required: false,
        public: false,
        i18nLabel: 'Gemini API Key',
        i18nDescription: 'Google Gemini API key for translations. Get one free at aistudio.google.com/app/apikey',
    },
    {
        id: 'ugajapa_default_target_lang',
        type: SettingType.SELECT,
        packageValue: 'ja',
        values: [
            { key: 'ja', i18nLabel: 'Japanese' },
            { key: 'en', i18nLabel: 'English' },
            { key: 'lg', i18nLabel: 'Luganda' },
        ],
        required: true,
        public: true,
        i18nLabel: 'Default Target Language',
        i18nDescription: 'Default language when a channel has no /set-language override.',
    },
    {
        id: 'ugajapa_show_hints',
        type: SettingType.BOOLEAN,
        packageValue: true,
        required: false,
        public: true,
        i18nLabel: 'Show Cultural Intelligence Hints',
        i18nDescription: 'Display cultural context hints when nuance may cause misunderstanding.',
    },
    {
        id: 'ugajapa_auto_translate',
        type: SettingType.BOOLEAN,
        packageValue: true,
        required: false,
        public: true,
        i18nLabel: 'Auto-translate all messages',
        i18nDescription: 'Automatically translate every text message in enabled channels.',
    },
];
