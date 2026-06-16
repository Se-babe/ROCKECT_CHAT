import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { SupportedLanguage } from './LanguageDetectionService';

interface RoomLanguageRecord {
    targetLang: SupportedLanguage;
}

export class RoomLanguageService {
    private static association(roomId: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId);
    }

    public static async setLanguage(persis: IPersistence, roomId: string, lang: SupportedLanguage): Promise<void> {
        await persis.updateByAssociation(this.association(roomId), { targetLang: lang }, true);
    }

    public static async getLanguage(read: IRead, roomId: string): Promise<SupportedLanguage | undefined> {
        const room = await read.getRoomReader().getById(roomId);
        const roomLang = room?.customFields?.ugajapa_targetLang;
        if (typeof roomLang === 'string') {
            return roomLang as SupportedLanguage;
        }

        const records = await read.getPersistenceReader().readByAssociation(this.association(roomId));
        const record = records[0] as RoomLanguageRecord | undefined;
        return record?.targetLang;
    }
}
