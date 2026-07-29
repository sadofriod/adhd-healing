import { describe, expect, it } from 'bun:test';
import {
  buildReminderDescription,
  extractMilestone,
  extractTitle,
  normalizeFinalMarkdown,
} from './markdown.js';

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

  it('builds reminder descriptions with detailed steps and full output', () => {
    const description = buildReminderDescription(fullMarkdown);

    expect(description).toContain('## 总结');
    expect(description).toContain('搭建本地想法蒸馏网关');
    expect(description).toContain('## 详细步骤');
    expect(description).toContain('1. 启动本地服务');
    expect(description).toContain('## 完整蒸馏输出');
    expect(description).toContain(fullMarkdown.trim());
  });

  it('normalizes missing sections with an actionable milestone block', () => {
    const normalized = normalizeFinalMarkdown('整理一个本地优先的思路', '无相关历史记录');

    expect(normalized).toContain('### 🎯 今日灵感内核');
    expect(normalized).toContain('### 🔄 历史思维连线 (RAG 检索结果)');
    expect(normalized).toContain('### 🚀 20分钟强制里程碑 (Milestone)');
    expect(normalized).toContain('明确 20 分钟第一步');
    expect(normalized).toContain('- 写下第一个可执行动作');
  });
});