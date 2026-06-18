import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { SupportedLanguage } from './LanguageDetectionService';

export interface SynthesizeRequest {
    text: string;
    targetLang: SupportedLanguage;
    endpoint: string;
    apiKey: string;
    http: IHttp;
}

export interface SynthesizeResult {
    audio: Buffer | null;
    mimeType: string;
    demo: boolean;
    error?: string;
}

export class TextToSpeechService {
    public static async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
        const endpoint = req.endpoint?.trim() ?? '';

        if (!endpoint) {
            return {
                audio: null,
                mimeType: 'audio/ogg',
                demo: true,
                error: 'No TTS endpoint configured. Translated text is shown without synthesized audio.',
            };
        }

        if (endpoint.includes('integrate.api.nvidia.com')) {
            return {
                audio: null,
                mimeType: 'audio/ogg',
                demo: true,
                error: 'NVIDIA cloud TTS is not available yet. Translated text is shown without synthesized audio.',
            };
        }

        return {
            audio: null,
            mimeType: 'audio/ogg',
            demo: true,
            error: 'Custom TTS endpoint not configured. Translated text is shown without synthesized audio.',
        };
    }
}
