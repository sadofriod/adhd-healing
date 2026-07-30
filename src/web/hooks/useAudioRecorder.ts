import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';

type RecorderStatus = 'idle' | 'recording' | 'ready' | 'unsupported';

type RecorderState = {
  readonly audioBlob: Blob | null;
  readonly durationMs: number;
  readonly errorMessage: string | null;
  readonly mimeType: string | null;
  readonly status: RecorderStatus;
};

type AudioRecorderApi = {
  readonly clearRecording: () => void;
  readonly isSupported: boolean;
  readonly startRecording: () => Promise<void>;
  readonly state: RecorderState;
  readonly stopRecording: () => void;
};

type SetRecorderState = Dispatch<SetStateAction<RecorderState>>;

type RecorderRefs = {
  readonly chunksRef: MutableRefObject<Blob[]>;
  readonly recorderRef: MutableRefObject<MediaRecorder | null>;
  readonly startedAtRef: MutableRefObject<number>;
  readonly streamRef: MutableRefObject<MediaStream | null>;
};

const RECORDER_MIME_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

function getInitialRecorderState(): RecorderState {
  if (!supportsAudioRecording()) {
    return {
      audioBlob: null,
      durationMs: 0,
      errorMessage: null,
      mimeType: null,
      status: 'unsupported',
    };
  }

  return {
    audioBlob: null,
    durationMs: 0,
    errorMessage: null,
    mimeType: null,
    status: 'idle',
  };
}

function supportsAudioRecording(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
}

function getSupportedMimeType(): string | null {
  for (const mimeType of RECORDER_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

function buildReadyState(audioBlob: Blob, mimeType: string, durationMs: number): RecorderState {
  return {
    audioBlob,
    durationMs,
    errorMessage: null,
    mimeType,
    status: 'ready',
  };
}

function buildErrorState(errorMessage: string): RecorderState {
  return {
    audioBlob: null,
    durationMs: 0,
    errorMessage,
    mimeType: null,
    status: supportsAudioRecording() ? 'idle' : 'unsupported',
  };
}

function buildRecordingState(mimeType: string | null): RecorderState {
  return {
    audioBlob: null,
    durationMs: 0,
    errorMessage: null,
    mimeType,
    status: 'recording',
  };
}

function getRecorderStateCleanup(streamRef: MutableRefObject<MediaStream | null>): () => void {
  return () => stopMediaStream(streamRef.current);
}

function createDurationTicker(
  startedAtRef: MutableRefObject<number>,
  setState: SetRecorderState
): () => void {
  const timerId = window.setInterval(() => {
    setState(current => ({
      ...current,
      durationMs: Date.now() - startedAtRef.current,
    }));
  }, 250);

  return () => window.clearInterval(timerId);
}

function createRecorder(stream: MediaStream): { recorder: MediaRecorder; mimeType: string | null } {
  const mimeType = getSupportedMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  return { recorder, mimeType };
}

function setRecorderRefs(refs: RecorderRefs, stream: MediaStream, recorder: MediaRecorder): void {
  refs.chunksRef.current = [];
  refs.startedAtRef.current = Date.now();
  refs.streamRef.current = stream;
  refs.recorderRef.current = recorder;
}

function clearRecorderRefs(refs: Pick<RecorderRefs, 'recorderRef' | 'streamRef'>): void {
  refs.recorderRef.current = null;
  refs.streamRef.current = null;
}

function handleReadyState(refs: RecorderRefs, setState: SetRecorderState, mimeType: string): void {
  const audioBlob = new Blob(refs.chunksRef.current, { type: mimeType });
  const durationMs = Date.now() - refs.startedAtRef.current;

  stopMediaStream(refs.streamRef.current);
  clearRecorderRefs(refs);
  setState(buildReadyState(audioBlob, mimeType, durationMs));
}

function attachRecorderHandlers(
  refs: RecorderRefs,
  recorder: MediaRecorder,
  setState: SetRecorderState,
  mimeType: string | null
): void {
  recorder.ondataavailable = event => {
    refs.chunksRef.current = event.data.size > 0 ? [...refs.chunksRef.current, event.data] : refs.chunksRef.current;
  };
  recorder.onerror = () => {
    stopMediaStream(refs.streamRef.current);
    setState(buildErrorState('录音失败，请检查浏览器麦克风权限。'));
  };
  recorder.onstop = () => {
    handleReadyState(refs, setState, recorder.mimeType || mimeType || 'audio/webm');
  };
}

export function useAudioRecorder(): AudioRecorderApi {
  const [state, setState] = useState<RecorderState>(getInitialRecorderState);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRefs = { chunksRef, recorderRef, startedAtRef, streamRef };

  useEffect(() => getRecorderStateCleanup(streamRef), []);

  useEffect(() => {
    if (state.status !== 'recording') return;

    return createDurationTicker(startedAtRef, setState);
  }, [state.status]);

  async function startRecording(): Promise<void> {
    if (!supportsAudioRecording()) {
      setState(getInitialRecorderState());
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { recorder, mimeType } = createRecorder(stream);

      setRecorderRefs(recorderRefs, stream, recorder);
      attachRecorderHandlers(recorderRefs, recorder, setState, mimeType);
      recorder.start();
      setState(buildRecordingState(mimeType));
    } catch {
      setState(buildErrorState('无法启动录音，请允许浏览器访问麦克风。'));
    }
  }

  function stopRecording(): void {
    recorderRef.current?.stop();
  }

  function clearRecording(): void {
    setState(getInitialRecorderState());
  }

  return {
    clearRecording,
    isSupported: state.status !== 'unsupported',
    startRecording,
    state,
    stopRecording,
  };
}