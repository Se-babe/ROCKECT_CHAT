import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { LanguageDetectionService, SupportedLanguage } from './LanguageDetectionService';

export const DEFAULT_STT_URL = 'http://stt-proxy:8090/v1/transcribe';
export const NVIDIA_STT_URL = 'https://integrate.api.nvidia.com/v1/audio/transcriptions';
export const NVIDIA_TTS_URL = 'https://integrate.api.nvidia.com/v1/audio/speech';
const WHISPER_MODEL = 'Systran/faster-whisper-base';
const TTS_MODEL = 'nvidia/magpie-tts-multilingual';

export function resolveNvidiaApiKey(apiKey: string): string | null {
    const key = apiKey?.trim();
    return key?.startsWith('nvapi-') ? key : null;
}

export class NvidiaMediaService {
    public static async transcribe(
        media: Buffer,
        mimeType: string,
        apiKey: string,
        http: IHttp,
        endpoint = DEFAULT_STT_URL,
        useCloudNvidia = false,
    ): Promise<{ text: string; sourceLang: SupportedLanguage; demo: boolean }> {
        const extension = this.extensionForMime(mimeType);
        const filename = `clip.${extension}`;

        if (this.isJsonProxyEndpoint(endpoint)) {
            return this.transcribeViaJsonProxy(media, mimeType, filename, apiKey, http, endpoint, useCloudNvidia);
        }

        const form = this.buildMultipartForm(
            useCloudNvidia
                ? { model: 'openai/whisper-large-v3', language: 'multi' }
                : { model: WHISPER_MODEL },
            {
                name: 'file',
                filename: `clip.${extension}`,
                mimeType: mimeType || 'audio/ogg',
                data: media,
            },
        );

        const headers: Record<string, string> = {
            'Content-Type': form.contentType,
            Accept: 'application/json',
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await http.post(endpoint, {
            headers,
            content: form.body.toString('latin1'),
            encoding: null,
        });

        if (!response || response.statusCode >= 400) {
            const detail = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.data);
            throw new Error(`STT error: ${response?.statusCode} - ${detail}`);
        }

        const body = response.data || (response.content ? JSON.parse(response.content as string) : null);
        const text: string | undefined = body?.text ?? body?.transcript;

        if (!text?.trim()) {
            throw new Error('No speech detected in the audio clip.');
        }

        return { text: text.trim(), sourceLang: LanguageDetectionService.detect(text), demo: false };
    }

    private static isJsonProxyEndpoint(endpoint: string): boolean {
        return endpoint.includes('stt-proxy') || endpoint.endsWith('/v1/transcribe');
    }

    private static async transcribeViaJsonProxy(
        media: Buffer,
        mimeType: string,
        filename: string,
        apiKey: string,
        http: IHttp,
        endpoint: string,
        useCloudNvidia: boolean,
    ): Promise<{ text: string; sourceLang: SupportedLanguage; demo: boolean }> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await http.post(endpoint, {
            headers,
            content: JSON.stringify({
                audioBase64: media.toString('base64'),
                mimeType: mimeType || 'audio/mpeg',
                filename,
                model: useCloudNvidia ? 'openai/whisper-large-v3' : WHISPER_MODEL,
            }),
        });

        if (!response || response.statusCode >= 400) {
            const detail = typeof response?.content === 'string'
                ? response.content
                : JSON.stringify(response?.data ?? response?.content);
            throw new Error(`STT error: ${response?.statusCode} - ${detail}`);
        }

        const body = response.data || (response.content ? JSON.parse(response.content as string) : null);

        if (body?.detail && !body?.text && !body?.transcript) {
            throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
        }

        const text: string | undefined = body?.text ?? body?.transcript;

        if (!text?.trim()) {
            throw new Error('No speech detected in the audio clip.');
        }

        return { text: text.trim(), sourceLang: LanguageDetectionService.detect(text), demo: false };
    }

    public static async synthesize(
        text: string,
        targetLang: SupportedLanguage,
        apiKey: string,
        http: IHttp,
        endpoint = NVIDIA_TTS_URL,
    ): Promise<{ audio: Buffer; mimeType: string; demo: boolean }> {
        const response = await http.post(endpoint, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'audio/wav, audio/mpeg, application/json',
            },
            content: JSON.stringify({
                model: TTS_MODEL,
                input: text,
                response_format: 'wav',
                language: this.ttsLanguage(targetLang),
            }),
            encoding: null,
        });

        if (!response || response.statusCode >= 400) {
            const errBody = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.data);
            throw new Error(`NVIDIA TTS error: ${response?.statusCode} - ${errBody}`);
        }

        const audio = this.responseToBuffer(response);
        if (!audio.length) {
            throw new Error('NVIDIA TTS returned empty audio');
        }

        return { audio, mimeType: 'audio/wav', demo: false };
    }

    private static buildMultipartForm(
        fields: Record<string, string>,
        file: { name: string; filename: string; mimeType: string; data: Buffer },
    ): { body: Buffer; contentType: string } {
        const boundary = `----UgaJapa${Date.now().toString(16)}`;
        const chunks: Buffer[] = [];

        for (const [key, value] of Object.entries(fields)) {
            chunks.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
            ));
        }

        chunks.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
        ));
        chunks.push(file.data);
        chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        return {
            body: Buffer.concat(chunks),
            contentType: `multipart/form-data; boundary=${boundary}`,
        };
    }

    private static extensionForMime(mimeType: string): string {
        if (mimeType.includes('webm')) return 'webm';
        if (mimeType.includes('wav')) return 'wav';
        if (mimeType.includes('mp4')) return 'mp4';
        if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
        return 'ogg';
    }

    private static ttsLanguage(targetLang: SupportedLanguage): string {
        switch (targetLang) {
            case 'ja': return 'Japanese';
            case 'lg': return 'English';
            default: return 'English';
        }
    }

    private static responseToBuffer(response: { content?: string | Buffer; data?: unknown }): Buffer {
        if (Buffer.isBuffer(response.content)) {
            return response.content;
        }
        if (typeof response.content === 'string') {
            return Buffer.from(response.content, 'binary');
        }
        if (typeof response.data === 'string') {
            return Buffer.from(response.data, 'binary');
        }
        return Buffer.alloc(0);
    }
}
