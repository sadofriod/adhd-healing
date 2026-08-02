type ToolCallStep = {
  readonly toolCalls: readonly {
    readonly toolName: string;
  }[];
};

function getToolDisplayName(
  toolName: string,
  mcpToolNames: ReadonlySet<string>
): string {
  if (toolName === 'browser_search') return `${toolName}（内置）`;
  if (mcpToolNames.has(toolName)) return `${toolName}（MCP）`;
  return toolName;
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
