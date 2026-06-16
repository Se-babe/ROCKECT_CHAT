import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { LanguageDetectionService, SupportedLanguage } from './LanguageDetectionService';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const STT_MODEL = 'gemini-2.0-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const TRANSCRIBE_PROMPT = `Transcribe all spoken words in this clip. Respond ONLY with valid JSON (no markdown):
{"text":"<full transcript>","language":"en"|"lg"|"ja"}
Use "lg" for Luganda, "ja" for Japanese, "en" for English.`;

export function resolveGeminiApiKey(translationKey: string, geminiKey?: string): string | null {
    const dedicated = geminiKey?.trim();
    if (dedicated) return dedicated;

    const shared = translationKey?.trim();
    if (shared?.startsWith('AIza')) return shared;

    return null;
}

export class GeminiMediaService {
    public static async transcribe(
        media: Buffer,
        mimeType: string,
        apiKey: string,
        http: IHttp,
    ): Promise<{ text: string; sourceLang: SupportedLanguage; demo: boolean }> {
        const response = await http.post(
            `${GEMINI_BASE}/${STT_MODEL}:generateContent`,
            {
                headers: {
                    'x-goog-api-key': apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                content: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: TRANSCRIBE_PROMPT },
                            {
                                inlineData: {
                                    mimeType: mimeType || 'audio/ogg',
                                    data: media.toString('base64'),
                                },
                            },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048,
                    },
                }),
            },
        );

        if (!response || response.statusCode >= 400) {
            throw new Error(`Gemini STT error: ${response?.statusCode} - ${response?.content}`);
        }

        const body = response.data || (response.content ? JSON.parse(response.content as string) : null);
        const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!rawText) {
            throw new Error(`Unexpected Gemini STT response: ${JSON.stringify(body)}`);
        }

        const parsed = this.parseJsonResponse(rawText);
        const text = parsed.text?.trim();
        if (!text) {
            throw new Error('Gemini STT returned empty transcript');
        }

        const sourceLang = this.normalizeLanguage(parsed.language) ?? LanguageDetectionService.detect(text);
        return { text, sourceLang, demo: false };
    }

    public static async synthesize(
        text: string,
        targetLang: SupportedLanguage,
        apiKey: string,
        http: IHttp,
    ): Promise<{ audio: Buffer; mimeType: string; demo: boolean }> {
        const languageCode = this.ttsLanguageCode(targetLang);

        const response = await http.post(
            `${GEMINI_BASE}/${TTS_MODEL}:generateContent`,
            {
                headers: {
                    'x-goog-api-key': apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                content: JSON.stringify({
                    contents: [{
                        parts: [{ text }],
                    }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            languageCode,
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: 'Kore',
                                },
                            },
                        },
                    },
                }),
            },
        );

        if (!response || response.statusCode >= 400) {
            throw new Error(`Gemini TTS error: ${response?.statusCode} - ${response?.content}`);
        }

        const body = response.data || (response.content ? JSON.parse(response.content as string) : null);
        const base64Pcm: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64Pcm) {
            throw new Error(`Unexpected Gemini TTS response: ${JSON.stringify(body)}`);
        }

        const pcm = Buffer.from(base64Pcm, 'base64');
        return { audio: this.pcmToWav(pcm), mimeType: 'audio/wav', demo: false };
    }

    private static parseJsonResponse(rawText: string): { text?: string; language?: string } {
        const clean = rawText.replace(/```json|```/g, '').trim();
        try {
            return JSON.parse(clean);
        } catch {
            return { text: clean };
        }
    }

    private static normalizeLanguage(value?: string): SupportedLanguage | null {
        const lang = value?.trim().toLowerCase();
        if (lang === 'en' || lang === 'lg' || lang === 'ja') return lang;
        return null;
    }

    private static ttsLanguageCode(targetLang: SupportedLanguage): string {
        switch (targetLang) {
            case 'ja': return 'ja-JP';
            case 'lg': return 'en-US';
            default: return 'en-US';
        }
    }

    private static pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
        const byteRate = sampleRate * channels * (bitsPerSample / 8);
        const blockAlign = channels * (bitsPerSample / 8);
        const header = Buffer.alloc(44);

        header.write('RIFF', 0);
        header.writeUInt32LE(36 + pcm.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(pcm.length, 40);

        return Buffer.concat([header, pcm]);
    }
}
