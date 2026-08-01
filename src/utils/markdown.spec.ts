import { describe, expect, it } from 'bun:test';
import {
  buildReminderContent,
  buildReminderDescription,
  extractMilestone,
  extractTitle,
  normalizeFinalMarkdown,
} from './markdown';

const fullMarkdown = `### 🎯 今日灵感内核
搭建本地想法蒸馏网关
把零散语音灵感快速整理成可执行计划。

### 🔄 历史思维连线 (RAG 检索结果)
无相关历史记录

### 🚀 20分钟强制里程碑 (Milestone)
打通第一条文本蒸馏链路
1. 启动本地服务
2. 发送一条测试文本
3. 验证 Markdown 和 Reminder 输出`;

describe('markdown helpers', () => {
  it('extracts brief summary titles for markdown and reminders', () => {
    expect(extractTitle(fullMarkdown)).toBe('搭建本地想法蒸馏网关');
    expect(extractMilestone(fullMarkdown)).toBe('打通第一条文本蒸馏链路');
  });

  it('removes Markdown and LaTeX syntax from reminder titles', () => {
    const markdown = fullMarkdown.replace(
      '打通第一条文本蒸馏链路',
      '**完成“录音 $\\to$ AI 处理 $\\to$ 输出”的闭环**'
    );

    expect(extractMilestone(markdown)).toBe('完成“录音 → AI 处理 → 输出”的闭环');
  });

  it('builds concise reminder notes instead of copying the full markdown', () => {
    const description = buildReminderDescription(fullMarkdown);

    expect(description).toContain('项目');
    expect(description).toContain('搭建本地想法蒸馏网关');
    expect(description).toContain('下一步');
    expect(description).toContain('1. 启动本地服务');
    expect(description).toContain('预计用时\n20 分钟');
    expect(description).not.toContain('###');
    expect(description).not.toContain('历史思维连线');
  });

  it('normalizes missing sections with an actionable milestone block', () => {
    const normalized = normalizeFinalMarkdown('整理一个本地优先的思路', '无相关历史记录');

    expect(normalized).toContain('### 🎯 今日灵感内核');
    expect(normalized).toContain('### 🔄 历史思维连线 (RAG 检索结果)');
    expect(normalized).toContain('### 🚀 20分钟强制里程碑 (Milestone)');
    expect(normalized).toContain('明确 20 分钟第一步');
    expect(normalized).toContain('- 写下第一个可执行动作');
  });

  it('rebuilds a single canonical markdown when the model repeats the required sections', () => {
    const normalized = normalizeFinalMarkdown(
      [
        '### 🎯 今日灵感内核',
        '当前想法是先验证 FreeCAD 切片插件的可行性。',
        '',
        '### 🔄 历史思维连线 (RAG 检索结果)',
        '- 之前做过一个本地优先的想法蒸馏工具。',
        '',
        '### 🚀 20分钟强制里程碑 (Milestone)',
        '先完成第一版技术验证',
        '- 调研 FreeCAD 插件接口',
        '',
        '### 🎯 今日灵感内核',
        '这是重复出现的旧想法，不应该继续保留。',
        '',
        '### 🔄 历史思维连线 (RAG 检索结果)',
        '- 这是重复的历史内容。',
        '',
        '### 🚀 20分钟强制里程碑 (Milestone)',
        '这是重复的旧里程碑',
        '- 这是重复的旧步骤',
      ].join('\n'),
      '无相关历史记录'
    );

    expect(normalized).toContain('当前想法是先验证 FreeCAD 切片插件的可行性。');
    expect(normalized).toContain('先完成第一版技术验证');
    expect(normalized).not.toContain('这是重复出现的旧想法，不应该继续保留。');
    expect(normalized).not.toContain('这是重复的历史内容。');
    expect(normalized).not.toContain('这是重复的旧里程碑');
  });
});

describe('general Markdown reminder', () => {
  it('maps markdown content to reminder fields', () => {
    const content = buildReminderContent(
      `${fullMarkdown}\n\n参考：[Bun 文档](https://bun.sh/docs)`,
      '备用任务标题'
    );

    expect(content.title).toBe('打通第一条文本蒸馏链路');
    expect(content.notes).toContain('3. 验证 Markdown 和 Reminder 输出');
    expect(content.url).toBe('https://bun.sh/docs');
  });

  it('uses the document title and supplied milestone', () => {
    const content = buildReminderContent(
      '# agent-company 商业化运行方案\n\n## 一、定位与价值主张\n让开发者更容易编排多个智能体。',
      '20分钟任务：为 agent-company 写一份「30 秒 Demo」脚本'
    );

    expect(content.title).toBe('为 agent-company 写一份「30 秒 Demo」脚本');
    expect(content.notes).toContain('项目\nagent-company 商业化运行方案');
    expect(content.notes).toContain('下一步\n- 为 agent-company 写一份「30 秒 Demo」脚本');
    expect(content.notes).not.toContain('未命名想法');
    expect(content.notes).not.toContain('写下第一个可执行动作');
  });
});