import type { ChangeEvent, FormEvent, JSX } from 'react';
import { useRef, useState } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import type { Locale } from '../../i18n/locale';
import type { DistillAttachment } from '../../types';
import { getWebMessage } from '../i18n/messages';

type AttachmentDraft = DistillAttachment & {
  readonly id: string;
};

type RestoredComposerDraft = {
  readonly text: string;
  readonly attachments: readonly DistillAttachment[];
};

type TextComposerProps = {
  readonly disabled: boolean;
  readonly locale: Locale;
  readonly prompt: string;
  readonly restoredDraft?: RestoredComposerDraft | null;
  readonly onSubmit: (text: string, attachments: readonly DistillAttachment[]) => Promise<void>;
};

async function readAttachment(file: File): Promise<DistillAttachment> {
  return {
    name: file.name,
    content: await file.text(),
    mimeType: file.type || undefined,
    size: file.size,
  };
}

function isAttachmentDraft(
  attachment: DistillAttachment | AttachmentDraft
): attachment is AttachmentDraft {
  return 'id' in attachment;
}

function getAttachmentKey(
  attachment: DistillAttachment | AttachmentDraft,
  index: number
): string {
  if (isAttachmentDraft(attachment)) return attachment.id;
  return `${attachment.name}:${attachment.size}:${index}`;
}

// eslint-disable-next-line complexity
export function TextComposer(props: TextComposerProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<readonly AttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const visibleText = props.restoredDraft?.text ?? value;
  const visibleAttachments = props.restoredDraft?.attachments ?? attachments;
  const canSubmit = value.trim().length > 0 && !props.disabled;

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) return;

    try {
      const drafts = await Promise.all(Array.from(files).map(async file => ({
        id: crypto.randomUUID(),
        ...(await readAttachment(file)),
      })));
      setAttachments(current => [...current, ...drafts]);
      setAttachmentError(null);
    } catch {
      setAttachmentError(getWebMessage(props.locale, 'composerAttachmentReadFailed'));
    } finally {
      event.currentTarget.value = '';
    }
  }

  function triggerAttachmentPicker(): void {
    fileInputRef.current?.click();
  }

  function removeAttachment(id: string): void {
    setAttachments(current => current.filter(attachment => attachment.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    await props.onSubmit(trimmedValue, attachments);
    setValue('');
    setAttachments([]);
    setAttachmentError(null);
  }

  return (
    <form className="composer-form" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        accept="text/*,.md,.markdown,.txt,.json,.csv,.yaml,.yml"
        aria-hidden="true"
        className="sr-only"
        disabled={props.disabled}
        multiple
        onChange={handleFileSelection}
        tabIndex={-1}
        type="file"
      />
      <div className="composer-attachments">
        <button
          className="attachment-button"
          disabled={props.disabled}
          onClick={triggerAttachmentPicker}
          type="button"
        >
          <Paperclip aria-hidden="true" size={16} />
          {getWebMessage(props.locale, 'composerAttachFile')}
        </button>
        <span className="attachment-hint">{getWebMessage(props.locale, 'composerAttachmentHint')}</span>
      </div>
      {visibleAttachments.length > 0 ? (
        <div className="attachment-list" aria-label={getWebMessage(props.locale, 'composerAttachmentList')}>
            {visibleAttachments.map((attachment, index) => (
              <div className="attachment-pill" key={getAttachmentKey(attachment, index)}>
              <span>{`${attachment.name} · ${attachment.size.toLocaleString()} bytes`}</span>
              <button
                aria-label={`${getWebMessage(props.locale, 'composerAttachmentRemove')} ${attachment.name}`}
                className="attachment-remove"
                  disabled={props.disabled || !isAttachmentDraft(attachment) || props.restoredDraft !== undefined && props.restoredDraft !== null}
                  onClick={() => {
                    if (isAttachmentDraft(attachment)) removeAttachment(attachment.id);
                  }}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachmentError ? <p className="composer-error">{attachmentError}</p> : null}
      <div className="composer-input-wrap">
        <label className="sr-only" htmlFor="distill-text">{getWebMessage(props.locale, 'composerInputLabel')}</label>
        <textarea
          id="distill-text"
          className="composer-textarea"
          disabled={props.disabled}
          onChange={event => setValue(event.currentTarget.value)}
          placeholder={props.prompt}
          rows={3}
          value={visibleText}
        />
        <button
          aria-label={getWebMessage(props.locale, 'composerSend')}
          className="send-button"
          disabled={!canSubmit}
          title={getWebMessage(props.locale, 'composerSend')}
          type="submit"
        >
          <ArrowUp aria-hidden="true" size={20} />
        </button>
      </div>
    </form>
  );
}