type ToolCallStep = {
  readonly toolCalls: readonly {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly args: unknown;
  }[];
};

type ToolResultStep = {
  readonly toolResults: readonly {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly result: unknown;
  }[];
};

export type ToolActivity = {
  readonly operationId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output?: unknown;
};

export type ToolFailure = {
  readonly toolName: string;
  readonly error: string;
};

export function getToolDisplayName(
  toolName: string,
  mcpToolNames: ReadonlySet<string>
): string {
  if (toolName === 'browser_search') return `${toolName}（内置）`;
  if (mcpToolNames.has(toolName)) return `${toolName}（MCP）`;
  return toolName;
}

export function collectToolActivities(
  steps: readonly (ToolCallStep & ToolResultStep)[],
  mcpToolNames: ReadonlySet<string>
): readonly ToolActivity[] {
  const results = new Map(
    steps.flatMap(step => step.toolResults).map(result => [result.toolCallId, result])
  );
  return steps.flatMap(step => step.toolCalls.map(toolCall => {
    const toolResult = results.get(toolCall.toolCallId);
    return {
      operationId: toolCall.toolCallId,
      toolName: getToolDisplayName(toolCall.toolName, mcpToolNames),
      input: toolCall.args,
      ...(toolResult ? { output: toolResult.result } : {}),
    };
  }));
}

export function collectToolDisplayNames(
  steps: readonly ToolCallStep[],
  mcpToolNames: ReadonlySet<string>
): readonly string[] {
  const names = steps.flatMap(step => step.toolCalls.map(
    toolCall => getToolDisplayName(toolCall.toolName, mcpToolNames)
  ));
  return [...new Set(names)];
}

function isObjectResult(result: unknown): result is object {
  return typeof result === 'object' && result !== null;
}

function hasFailureStatus(result: object): boolean {
  return Reflect.get(result, 'ok') === false
    || Reflect.get(result, 'isError') === true;
}

function formatFailureMessage(result: object): string {
  const error = Reflect.get(result, 'error');
  if (error === undefined) return '工具返回失败状态';
  return String(error);
}

function getFailureMessage(result: unknown): string | null {
  if (!isObjectResult(result)) return null;
  if (!hasFailureStatus(result)) return null;
  return formatFailureMessage(result);
}

export function collectToolFailures(
  steps: readonly ToolResultStep[]
): readonly ToolFailure[] {
  const failures = steps.flatMap(step => step.toolResults.flatMap(toolResult => {
    const error = getFailureMessage(toolResult.result);
    return error ? [{ toolName: toolResult.toolName, error }] : [];
  }));
  return [...new Map(
    failures.map(failure => [failure.toolName, failure])
  ).values()];
}
