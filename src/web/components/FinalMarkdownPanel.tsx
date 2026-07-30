import type { JSX } from 'react';
import type { DistillResponse } from '../../types.js';

type FinalMarkdownPanelProps = {
  readonly response: DistillResponse | null;
};

type FinalMarkdownView = {
  readonly cardClassName: string;
  readonly markdown: string;
  readonly milestone: string;
  readonly placeholder: string;
  readonly statusLabel: string;
  readonly title: string;
};

const EMPTY_VIEW: FinalMarkdownView = {
  cardClassName: 'panel-surface result-card result-card-empty',
  markdown: '',
  milestone: '等待会话完成后提取',
  placeholder: '完成多轮澄清后，最终结果会在这里展开，方便直接复制到你的知识库里。',
  statusLabel: 'waiting',
  title: '最终 Markdown',
};

function getReadyTitle(response: DistillResponse): string {
  return response.final_title ?? '蒸馏结果';
}

function getReadyMilestone(response: DistillResponse): string {
  return response.milestone ?? '未提取到可执行里程碑';
}

function createReadyView(response: DistillResponse): FinalMarkdownView {
  return {
    cardClassName: 'panel-surface result-card',
    markdown: response.final_markdown ?? '',
    milestone: getReadyMilestone(response),
    placeholder: '',
    statusLabel: 'ready',
    title: getReadyTitle(response),
  };
}

function getFinalMarkdownView(response: DistillResponse | null): FinalMarkdownView {
  if (!response) return EMPTY_VIEW;
  return createReadyView(response);
}

export function FinalMarkdownPanel(props: FinalMarkdownPanelProps): JSX.Element {
  const view = getFinalMarkdownView(props.response);

  return (
    <section className={view.cardClassName}>
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Final output</p>
          <h2>{view.title}</h2>
        </div>
        <span className="status-pill">{view.statusLabel}</span>
      </div>
      <p className="result-meta">Milestone: {view.milestone}</p>
      <p className="result-placeholder" hidden={!view.placeholder}>{view.placeholder}</p>
      <article className="markdown-output" hidden={!view.markdown}>{view.markdown}</article>
    </section>
  );
}