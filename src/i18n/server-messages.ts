import type { Locale } from './locale';

const SERVER_MESSAGES = {
  zh: {
    notFound: '未找到请求资源',
    methodNotAllowed: '不支持该请求方法',
    sessionNotFound: '未找到会话',
    missingWebAsset: '缺少前端资源文件',
    invalidRequestPayload: '请求体格式无效',
    invalidRequestJson: '请求体必须是合法 JSON',
    distillTextRequired: 'text 必须是非空字符串',
  },
  en: {
    notFound: 'Not Found',
    methodNotAllowed: 'Method Not Allowed',
    sessionNotFound: 'Session not found',
    missingWebAsset: 'Missing web asset file',
    invalidRequestPayload: 'Invalid request payload',
    invalidRequestJson: 'Request body must be valid JSON',
    distillTextRequired: 'text must be a non-empty string',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type ServerMessageKey = keyof typeof SERVER_MESSAGES.zh;

export function getServerMessage(locale: Locale, key: ServerMessageKey): string {
  return SERVER_MESSAGES[locale][key];
}
