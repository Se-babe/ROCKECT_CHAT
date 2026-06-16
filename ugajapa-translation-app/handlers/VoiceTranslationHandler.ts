import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ClaudeTranslationService } from '../services/ClaudeTranslationService';
import { SpeechToTextService } from '../services/SpeechToTextService';
import { TextToSpeechService } from '../services/TextToSpeechService';
import { RoomLanguageService } from '../services/RoomLanguageService';
import { SupportedLanguage } from '../services/LanguageDetectionService';

export class VoiceTranslationHandler {
    public static getMediaFile(message: IMessage) {
        return message.files?.[0] ?? message.file;
    }

    public static isTranslatableMedia(message: IMessage): boolean {
        const file = this.getMediaFile(message);
        const group = file?.typeGroup;
        const type = file?.type;
        return Boolean(file && (group === 'audio' || group === 'video' || type?.startsWith('audio/') || type?.startsWith('video/')));
    }

    private static processedAssociation(fileId: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(RocketChatAssociationModel.FILE, `ugajapa_voice_${fileId}`);
    }

    public static async alreadyProcessed(read: IRead, fileId: string): Promise<boolean> {
        const records = await read.getPersistenceReader().readByAssociation(this.processedAssociation(fileId));
        return records.length > 0;
    }

    public static async execute(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const file = this.getMediaFile(message);
        if (!file) return;

        await persistence.createWithAssociation({ processedAt: new Date() }, this.processedAssociation(file._id));

        const apiKey = (await read.getEnvironmentReader().getSettings().getValueById('ugajapa_claude_api_key')) as string;
        const sttEndpoint = (await read.getEnvironmentReader().getSettings().getValueById('ugajapa_stt_endpoint')) as string;
        const ttsEndpoint = (await read.getEnvironmentReader().getSettings().getValueById('ugajapa_tts_endpoint')) as string;
        const targetLang = ((await RoomLanguageService.getLanguage(read, message.room.id)) || 'ja') as SupportedLanguage;

        const audioBuffer = await read.getUploadReader().getBufferById(file._id);

        const transcript = await SpeechToTextService.transcribe({
            audio: audioBuffer,
            mimeType: file.type || 'audio/ogg',
            endpoint: sttEndpoint,
            apiKey,
            http,
        });

        if (transcript.demo) {
            const reason = transcript.error || 'Speech-to-text failed';
            const builder = modify.getNotifier().getMessageBuilder()
                .setRoom(message.room)
                .setText(`⚠️ *Voice translation failed:* ${reason}`);
            await modify.getNotifier().notifyUser(message.sender, builder.getMessage());
            return;
        }

        if (transcript.sourceLang === targetLang) return;

        const translation = await ClaudeTranslationService.translate({
            text: transcript.text,
            sourceLang: transcript.sourceLang,
            targetLang,
            apiKey,
            http,
        });

        const synthesized = await TextToSpeechService.synthesize({
            text: translation.translation,
            targetLang,
            endpoint: ttsEndpoint,
            apiKey,
            http,
        });

        let captionText = `🎙️ *[${transcript.sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}]*\n${translation.translation}`;
        if (synthesized.demo && synthesized.error) {
            captionText += `\n\n_(No audio reply: ${synthesized.error})_`;
        }

        const attachment = synthesized.audio
            ? {
                audioUrl: (await modify.getCreator().getUploadCreator().uploadBuffer(synthesized.audio, {
                    filename: `translated-voice.${synthesized.mimeType.split('/')[1] || 'ogg'}`,
                    room: message.room,
                    user: message.sender,
                })).url,
                text: captionText,
                collapsed: false,
                color: '#1D9E75',
            }
            : { text: captionText, collapsed: false, color: '#F4A523' };

        const members = await read.getRoomReader().getMembers(message.room.id);
        const recipients = members.filter((member) => member.id !== message.sender.id);

        await Promise.all(
            recipients.map((recipient) => {
                const builder = modify.getNotifier().getMessageBuilder()
                    .setRoom(message.room)
                    .addAttachment(attachment);
                return modify.getNotifier().notifyUser(recipient, builder.getMessage());
            }),
        );
    }
}
