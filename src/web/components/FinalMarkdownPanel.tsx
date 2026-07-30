import type { JSX } from 'react';

type FinalMarkdownPanelProps = {
  readonly finalText: string | null;
};

function getCardClassName(hasResult: boolean): string {
  if (hasResult) return 'panel-surface result-card';
  return 'panel-surface result-card result-card-empty';
}

function getStatusLabel(hasResult: boolean): string {
  if (hasResult) return 'ready';
  return 'waiting';
}

function ResultContent({ finalText }: { finalText: string }): JSX.Element {
  return <article className="markdown-output">{finalText}</article>;
}

function EmptyContent(): JSX.Element {
  return (
    <p className="result-placeholder">
      完成多轮澄清后，最终结果会在这里展开，方便直接复制到你的知识库里。
    </p>
  );
}

export function FinalMarkdownPanel(props: FinalMarkdownPanelProps): JSX.Element {
  const hasResult = props.finalText !== null;

  return (
    <section className={getCardClassName(hasResult)}>
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Final output</p>
          <h2>蒸馏结果</h2>
        </div>
        <span className="status-pill">{getStatusLabel(hasResult)}</span>
      </div>
      {hasResult ? <ResultContent finalText={props.finalText as string} /> : <EmptyContent />}
    </section>
  );
}
