import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { LanguageDetectionService, SupportedLanguage } from './LanguageDetectionService';
import { GeminiMediaService, resolveGeminiApiKey } from './GeminiMediaService';

export interface TranscribeRequest {
    audio: Buffer;
    mimeType: string;
    endpoint: string;
    apiKey: string;
    geminiApiKey?: string;
    http: IHttp;
}

export interface TranscribeResult {
    text: string;
    sourceLang: SupportedLanguage;
    demo: boolean;
}

const DEMO_TRANSCRIPT = '[Voice message — demo mode, no Gemini API key configured for speech-to-text]';

export class SpeechToTextService {
    public static async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
        const geminiKey = resolveGeminiApiKey(req.apiKey, req.geminiApiKey);
        if (geminiKey) {
            try {
                return await GeminiMediaService.transcribe(req.audio, req.mimeType, geminiKey, req.http);
            } catch {
                // Fall through to custom endpoint or demo mode.
            }
        }

        if (!req.apiKey?.trim() || !req.endpoint?.trim()) {
            return { text: DEMO_TRANSCRIPT, sourceLang: 'en', demo: true };
        }

        try {
            const response = await req.http.post(req.endpoint, {
                headers: {
                    Authorization: `Bearer ${req.apiKey.trim()}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                content: JSON.stringify({
                    audio: req.audio.toString('base64'),
                    mime_type: req.mimeType,
                    encoding: 'base64',
                }),
            });

            if (!response || response.statusCode >= 400) {
                throw new Error(`STT endpoint error: ${response?.statusCode} - ${response?.content}`);
            }

            const body = response.data || (response.content ? JSON.parse(response.content) : null);
            const text: string | undefined = body?.text ?? body?.transcript ?? body?.results?.[0]?.alternatives?.[0]?.transcript;

            if (!text?.trim()) {
                throw new Error(`Unexpected STT response: ${JSON.stringify(body)}`);
            }

            return { text: text.trim(), sourceLang: LanguageDetectionService.detect(text), demo: false };
        } catch {
            return { text: DEMO_TRANSCRIPT, sourceLang: 'en', demo: true };
        }
    }
}
