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