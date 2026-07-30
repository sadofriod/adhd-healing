import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';

type AudioComposerProps = {
  readonly disabled: boolean;
  readonly onSubmit: (blob: Blob, fileName: string) => Promise<void>;
};

type PendingUpload = {
  readonly blob: Blob;
  readonly fileName: string;
};

const AUDIO_EXTENSION_RULES = [
  { token: 'mp4', extension: 'm4a' },
  { token: 'ogg', extension: 'ogg' },
] as const;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getAudioExtension(mimeType: string | null): string {
  const matchedRule = AUDIO_EXTENSION_RULES.find(rule => mimeType?.includes(rule.token));
  return matchedRule?.extension ?? 'webm';
}

function getPendingUpload(
  selectedFile: File | null,
  audioBlob: Blob | null,
  mimeType: string | null
): PendingUpload | null {
  if (selectedFile) {
    return { blob: selectedFile, fileName: selectedFile.name };
  }

  if (!audioBlob) return null;

  return {
    blob: audioBlob,
    fileName: `iphone-voice.${getAudioExtension(mimeType)}`,
  };
}

function getStartDisabled(disabled: boolean, isSupported: boolean, status: string): boolean {
  return [disabled, !isSupported, status === 'recording'].some(Boolean);
}

function getStopDisabled(disabled: boolean, status: string): boolean {
  return [disabled, status !== 'recording'].some(Boolean);
}

function getRecorderPrimaryMessage(status: string, durationMs: number): string {
  return status === 'recording' ? `录音中 ${formatDuration(durationMs)}` : '录音尚未开始';
}

function getReadyMessage(status: string, durationMs: number): string {
  return status === 'ready' ? `已准备好一段 ${formatDuration(durationMs)} 的录音。` : '';
}

function getSelectedFileMessage(selectedFile: File | null): string {
  return selectedFile ? `当前文件：${selectedFile.name}` : '未选择文件时，会优先上传刚才录下来的音频。';
}

function getCanSubmit(disabled: boolean, upload: PendingUpload | null): boolean {
  return !disabled && Boolean(upload);
}

export function AudioComposer(props: AudioComposerProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { clearRecording, isSupported, startRecording, state, stopRecording } = useAudioRecorder();
  const pendingUpload = getPendingUpload(selectedFile, state.audioBlob, state.mimeType);
  const canSubmit = getCanSubmit(props.disabled, pendingUpload);
  const primaryRecorderMessage = getRecorderPrimaryMessage(state.status, state.durationMs);
  const readyMessage = getReadyMessage(state.status, state.durationMs);
  const selectedFileMessage = getSelectedFileMessage(selectedFile);
  const recorderUnsupportedMessage = isSupported ? '' : '当前浏览器不支持 MediaRecorder，请改用文件上传。';
  const startDisabled = getStartDisabled(props.disabled, isSupported, state.status);
  const stopDisabled = getStopDisabled(props.disabled, state.status);

  async function handleSubmit(): Promise<void> {
    if (!pendingUpload) return;

    await props.onSubmit(pendingUpload.blob, pendingUpload.fileName);
    fileInputRef.current?.setAttribute('value', '');
    setSelectedFile(null);
    clearRecording();
  }

  function handleReset(): void {
    fileInputRef.current?.setAttribute('value', '');
    setSelectedFile(null);
    clearRecording();
  }

  return (
    <section className="panel-surface composer-card">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Voice input</p>
          <h2>录音上传</h2>
        </div>
        <span className="mode-pill">FormData</span>
      </div>

      <div className="audio-stack">
        <p className="audio-copy">优先用浏览器直接录音；如果权限受限，下面还能改成手动选音频文件。</p>

        <div className="audio-actions">
          <button
            className="secondary-button"
            disabled={startDisabled}
            onClick={() => void startRecording()}
            type="button"
          >
            开始录音
          </button>
          <button
            className="secondary-button"
            disabled={stopDisabled}
            onClick={stopRecording}
            type="button"
          >
            停止录音
          </button>
          <button className="ghost-button" disabled={props.disabled} onClick={handleReset} type="button">
            清空
          </button>
        </div>

        <div className="recorder-state">
          <p>{primaryRecorderMessage}</p>
          <p hidden={!readyMessage}>{readyMessage}</p>
          <p className="error-inline" hidden={!state.errorMessage}>{state.errorMessage ?? ''}</p>
          <p className="error-inline" hidden={!recorderUnsupportedMessage}>{recorderUnsupportedMessage}</p>
        </div>

        <label className="file-upload-label" htmlFor="audio-upload">
          手动选择音频文件
        </label>
        <input
          id="audio-upload"
          ref={fileInputRef}
          accept="audio/*"
          capture="user"
          className="file-upload-input"
          disabled={props.disabled}
          onChange={event => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
          type="file"
        />
        <p className="session-meta">{selectedFileMessage}</p>

        <button className="primary-button" disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
          发送录音
        </button>
      </div>
    </section>
  );
}