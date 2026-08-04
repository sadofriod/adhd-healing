import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { Locale } from '../../i18n/locale';
import { getWebMessage } from '../i18n/messages';

type TextComposerProps = {
  readonly disabled: boolean;
  readonly locale: Locale;
  readonly prompt: string;
  readonly onSubmit: (text: string) => Promise<void>;
};

export function TextComposer(props: TextComposerProps): JSX.Element {
  const [value, setValue] = useState('');
  const canSubmit = value.trim().length > 0 && !props.disabled;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    await props.onSubmit(trimmedValue);
    setValue('');
  }

  return (
    <form className="composer-form" onSubmit={handleSubmit}>
      <div className="composer-input-wrap">
        <label className="sr-only" htmlFor="distill-text">{getWebMessage(props.locale, 'composerInputLabel')}</label>
        <textarea
          id="distill-text"
          className="composer-textarea"
          disabled={props.disabled}
          onChange={event => setValue(event.currentTarget.value)}
          placeholder={props.prompt}
          rows={3}
          value={value}
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