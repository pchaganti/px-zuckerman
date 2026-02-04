/**
 * Edge Text-to-Speech Provider
 * 
 * Generates speech audio using Microsoft Edge's online neural text-to-speech service.
 * This is a free service that doesn't require an API key.
 */

export interface EdgeTextToSpeechOptions {
  voice?: string;
  lang?: string;
  outputFormat?: string;
  pitch?: string;
  rate?: string;
  volume?: string;
}

export interface EdgeTextToSpeechResult {
  success: boolean;
  audioBuffer?: Buffer;
  error?: string;
  latencyMs?: number;
}

import { EdgeTTS } from "node-edge-tts";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_EDGE_VOICE = "en-US-MichelleNeural";
const DEFAULT_EDGE_LANG = "en-US";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

export async function edgeTextToSpeech(
  text: string,
  options: EdgeTextToSpeechOptions = {},
): Promise<EdgeTextToSpeechResult> {
  const startTime = Date.now();
  
  try {
    const voice = options.voice || DEFAULT_EDGE_VOICE;
    const lang = options.lang || DEFAULT_EDGE_LANG;
    const outputFormat = options.outputFormat || DEFAULT_OUTPUT_FORMAT;

    // Configure EdgeTTS with options
    const ttsConfig: any = {
      voice,
      lang,
      outputFormat,
    };

    // Add pitch/rate/volume if specified
    if (options.pitch) ttsConfig.pitch = options.pitch;
    if (options.rate) ttsConfig.rate = options.rate;
    if (options.volume) ttsConfig.volume = options.volume;

    const tts = new EdgeTTS(ttsConfig);

    // Create temporary file path
    const tempFile = join(tmpdir(), `edge-tts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`);

    try {
      // Use ttsPromise to write to temp file
      await tts.ttsPromise(text, tempFile);

      // Read the file as buffer
      const audioBuffer = readFileSync(tempFile);

      const latencyMs = Date.now() - startTime;

      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return {
        success: true,
        audioBuffer,
        latencyMs,
      };
    } catch (ttsError) {
      // Clean up temp file on error
      try {
        unlinkSync(tempFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw ttsError;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get list of available Edge text-to-speech voices
 * Note: node-edge-tts doesn't provide a listVoices method, so we return an empty array
 * Users can find available voices at: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
 */
export async function getEdgeVoices(): Promise<Array<{ name: string; locale: string; gender: string }>> {
  // node-edge-tts doesn't have a listVoices() method
  // Return empty array - voices can be found at Microsoft's documentation
  return [];
}
