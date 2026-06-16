import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { SupportedLanguage } from './LanguageDetectionService';
import { GeminiMediaService, resolveGeminiApiKey } from './GeminiMediaService';

export interface SynthesizeRequest {
    text: string;
    targetLang: SupportedLanguage;
    endpoint: string;
    apiKey: string;
    geminiApiKey?: string;
    http: IHttp;
}

export interface SynthesizeResult {
    audio: Buffer | null;
    mimeType: string;
    demo: boolean;
}

export class TextToSpeechService {
    public static async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
        const geminiKey = resolveGeminiApiKey(req.apiKey, req.geminiApiKey);
        if (geminiKey) {
            try {
                return await GeminiMediaService.synthesize(req.text, req.targetLang, geminiKey, req.http);
            } catch {
                // Fall through to custom endpoint or demo mode.
            }
        }

        if (!req.apiKey?.trim() || !req.endpoint?.trim()) {
            return { audio: null, mimeType: 'audio/ogg', demo: true };
        }

        try {
            const response = await req.http.post(req.endpoint, {
                headers: {
                    Authorization: `Bearer ${req.apiKey.trim()}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                content: JSON.stringify({
                    text: req.text,
                    language: req.targetLang,
                    response_format: 'base64',
                }),
            });

            if (!response || response.statusCode >= 400) {
                throw new Error(`TTS endpoint error: ${response?.statusCode} - ${response?.content}`);
            }

            const body = response.data || (response.content ? JSON.parse(response.content) : null);
            const base64Audio: string | undefined = body?.audio ?? body?.audio_content;

            if (!base64Audio) {
                throw new Error(`Unexpected TTS response: ${JSON.stringify(body)}`);
            }

            return { audio: Buffer.from(base64Audio, 'base64'), mimeType: body?.mime_type ?? 'audio/ogg', demo: false };
        } catch {
            return { audio: null, mimeType: 'audio/ogg', demo: true };
        }
    }
}
