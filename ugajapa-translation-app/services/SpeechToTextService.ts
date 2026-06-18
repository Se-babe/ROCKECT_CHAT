import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { SupportedLanguage } from './LanguageDetectionService';
import { DEFAULT_STT_URL, NvidiaMediaService } from './NvidiaMediaService';

export interface TranscribeRequest {
    audio: Buffer;
    mimeType: string;
    endpoint: string;
    apiKey: string;
    http: IHttp;
}

export interface TranscribeResult {
    text: string;
    sourceLang: SupportedLanguage;
    demo: boolean;
    error?: string;
}

const DEMO_TRANSCRIPT = '[Voice message — speech-to-text unavailable]';

export class SpeechToTextService {
    public static async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
        const endpoint = req.endpoint?.trim() || DEFAULT_STT_URL;

        if (endpoint.includes('integrate.api.nvidia.com')) {
            return {
                text: DEMO_TRANSCRIPT,
                sourceLang: 'en',
                demo: true,
                error: 'NVIDIA cloud STT is not available on integrate.api.nvidia.com. Use the default local stt-proxy service or set a custom STT endpoint.',
            };
        }

        try {
            const apiKey = req.apiKey?.trim() ?? '';
            return await NvidiaMediaService.transcribe(req.audio, req.mimeType, apiKey, req.http, endpoint, false);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { text: DEMO_TRANSCRIPT, sourceLang: 'en', demo: true, error: message };
        }
    }
}
