import { IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { CulturalHintsService } from './CulturalHintsService';
import { SupportedLanguage } from './LanguageDetectionService';

export interface TranslationRequest {
    text: string;
    sourceLang: SupportedLanguage;
    targetLang: SupportedLanguage;
    apiKey: string;
    http: IHttp;
}

export interface TranslationResult {
    translation: string;
    culturalHint: string | null;
}

export class ClaudeTranslationService {
    public static async translate(req: TranslationRequest): Promise<TranslationResult> {
        if (!req.apiKey || !req.apiKey.trim()) {
            return this.demoTranslate(req);
        }

        const sourceName = CulturalHintsService.getLanguageName(req.sourceLang);
        const targetName = CulturalHintsService.getLanguageName(req.targetLang);

        const systemPrompt = `You are a professional translator specialising in Uganda-Japan communication. You translate between English, Luganda, and Japanese accurately and naturally. You also detect cultural nuance that could cause misunderstanding between Ugandan and Japanese communicators. Always respond ONLY in valid JSON format with no extra text, no markdown, no code blocks.`;

        const userPrompt = `Translate the following ${sourceName} text to ${targetName}. Also check if there is any cultural nuance (e.g. indirect refusals, honorifics, directness vs indirectness) that could cause misunderstanding.\n\nRespond ONLY in this exact JSON format:\n{"translation":"<translated text>","culturalHint":"<hint text or null>"}\n\nText: "${req.text.replace(/"/g, '\\"')}"`;

        // NVIDIA NIM API - compatible with OpenAI format
        const response = await req.http.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
                headers: {
                    'Authorization': `Bearer ${req.apiKey.trim()}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                content: JSON.stringify({
                    model: 'meta/llama-3.3-70b-instruct',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.2,
                    max_tokens: 1024,
                    stream: false,
                }),
            },
        );

        if (!response || response.statusCode >= 400) {
            const errBody = response?.content || JSON.stringify(response?.data) || 'no response';
            throw new Error(`NVIDIA API error: ${response?.statusCode} - ${errBody}`);
        }

        const body = response.data || (response.content ? JSON.parse(response.content as string) : null);

        const rawText = body?.choices?.[0]?.message?.content;
        if (!rawText) {
            throw new Error(`Unexpected NVIDIA response: ${JSON.stringify(body)}`);
        }

        // Clean and parse JSON
        const clean = rawText.replace(/```json|```/g, '').trim();

        let parsed: TranslationResult;
        try {
            parsed = JSON.parse(clean);
        } catch {
            return {
                translation: rawText.trim(),
                culturalHint: CulturalHintsService.detectHint(req.text, req.sourceLang, req.targetLang),
            };
        }

        return {
            translation: parsed.translation || rawText,
            culturalHint: parsed.culturalHint || CulturalHintsService.detectHint(req.text, req.sourceLang, req.targetLang),
        };
    }

    private static demoTranslate(req: TranslationRequest): TranslationResult {
        const samples: Partial<Record<string, string>> = {
            'en-ja': 'こんにちは！プロジェクトの進捗はいかがですか？',
            'ja-en': 'Hello! How is the project progressing?',
            'lg-ja': 'ありがとうございます、順調に進んでいます。',
            'en-lg': 'Webale nyo, emirimu egenda bulungi.',
            'ja-lg': 'Webale nyo ssebo.',
        };
        const key = `${req.sourceLang}-${req.targetLang}`;
        const culturalHint = CulturalHintsService.detectHint(req.text, req.sourceLang, req.targetLang);
        return {
            translation: samples[key] ?? `[${req.targetLang.toUpperCase()} demo] ${req.text}`,
            culturalHint,
        };
    }
}
