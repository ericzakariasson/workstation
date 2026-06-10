import type { VoiceSettings } from "@shared/types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** Sends recorded audio to an OpenAI-compatible /audio/transcriptions endpoint. */
export async function transcribeAudio(
  audio: ArrayBuffer,
  mimeType: string,
  voice: VoiceSettings | undefined,
): Promise<string> {
  if (!voice?.apiKey) {
    throw new Error("Voice transcription is not configured. Add an API key in Settings → Voice.");
  }
  const baseUrl = (voice.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = voice.model?.trim() || DEFAULT_MODEL;
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  const extension = EXTENSIONS[baseMime] ?? "webm";

  const form = new FormData();
  form.append("file", new Blob([audio], { type: baseMime }), `recording.${extension}`);
  form.append("model", model);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${voice.apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as { text?: string };
  return (body.text ?? "").trim();
}
