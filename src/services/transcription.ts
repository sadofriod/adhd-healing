import { getLlmClient } from './llm-client.js';

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

function buildAudioFile(audioBuffer: Buffer): File {
  const arrayBuffer = bufferToArrayBuffer(audioBuffer);
  const blob = new Blob([arrayBuffer], { type: 'audio/m4a' });
  return new File([blob], 'audio.m4a', { type: 'audio/m4a' });
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  console.log('[transcription] Transcribing audio...');
  const file = buildAudioFile(audioBuffer);
  const response = await getLlmClient().audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });
  console.log('[transcription] Done.');
  return response.text;
}
