import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const shortcutsDir = path.join(repoRoot, 'shortcuts');

function action(identifier, parameters = {}) {
  return {
    WFWorkflowActionIdentifier: identifier,
    WFWorkflowActionParameters: parameters,
  };
}

function text(value) {
  return action('is.workflow.actions.text', { WFTextActionText: value });
}

function setVariable(name) {
  return action('is.workflow.actions.setvariable', { WFVariableName: name });
}

function getVariable(name) {
  return action('is.workflow.actions.getvariable', { WFVariable: name });
}

function ask(prompt) {
  return action('is.workflow.actions.ask', {
    WFAskActionPrompt: prompt,
    WFInputType: 'Text',
  });
}

function dictateText() {
  return action('is.workflow.actions.dictatetext', {
    WFDictateTextStopListening: 'After Pause',
  });
}

function downloadJson(url, body) {
  return action('is.workflow.actions.downloadurl', {
    WFHTTPMethod: 'POST',
    WFURL: url,
    WFHTTPHeaders: {
      'Content-Type': 'application/json',
    },
    WFHTTPBodyType: 'JSON',
    WFJSONBody: body,
  });
}

function getDictionaryValue(key) {
  return action('is.workflow.actions.getdictionaryvalue', {
    WFDictionaryKey: key,
  });
}

function repeatStart(groupingIdentifier, count) {
  return action('is.workflow.actions.repeat.count', {
    WFRepeatCount: count,
    GroupingIdentifier: groupingIdentifier,
    WFControlFlowMode: 0,
  });
}

function repeatEnd(groupingIdentifier) {
  return action('is.workflow.actions.repeat.count', {
    GroupingIdentifier: groupingIdentifier,
    WFControlFlowMode: 2,
  });
}

function ifStart(groupingIdentifier, condition, value) {
  return action('is.workflow.actions.conditional', {
    WFCondition: condition,
    WFConditionalActionString: value,
    GroupingIdentifier: groupingIdentifier,
    WFControlFlowMode: 0,
  });
}

function ifEnd(groupingIdentifier) {
  return action('is.workflow.actions.conditional', {
    GroupingIdentifier: groupingIdentifier,
    WFControlFlowMode: 2,
  });
}

function setClipboard() {
  return action('is.workflow.actions.setclipboard');
}

function showResult(textValue) {
  return action('is.workflow.actions.showresult', { Text: textValue });
}

function stop() {
  return action('is.workflow.actions.stop');
}

function alert(title, message) {
  return action('is.workflow.actions.alert', {
    WFAlertActionTitle: title,
    WFAlertActionMessage: message,
    WFAlertActionCancelButtonShown: false,
  });
}

function buildShortcutShell({ name, iconColor, iconGlyph, promptActions }) {
  return {
    WFWorkflow: {
      WFWorkflowClientRelease: '18.0',
      WFWorkflowClientVersion: '1302.1.3',
      WFWorkflowName: name,
      WFWorkflowIcon: {
        WFWorkflowIconStartColor: iconColor,
        WFWorkflowIconGlyphNumber: iconGlyph,
      },
      WFWorkflowImportQuestions: [
        {
          WFWorkflowImportQuestionType: 'Text',
          WFWorkflowImportQuestionPrompt:
            '输入 iPhone 可访问的 distill 地址，例如 http://192.168.31.20:5001/distill',
          WFWorkflowImportQuestionDefaultValue: 'http://YOUR-MAC-IP:5001/distill',
          WFWorkflowImportQuestionVariable: 'baseUrl',
        },
      ],
      WFWorkflowInputContentItemClasses: [],
      WFWorkflowMinimumClientVersion: 900,
      WFWorkflowMinimumClientVersionString: '900',
      WFWorkflowOutputContentItemClasses: [],
      WFWorkflowHasOutputFallback: false,
      WFWorkflowTypes: ['QuickActions'],
      WFWorkflowHasShortcutInputVariables: false,
      WFWorkflowActions: [
        text('先把你的想法说出来，或直接输入。'),
        setVariable('Prompt'),
        text(''),
        setVariable('SessionID'),
        repeatStart('distill-loop', 30),
        ...promptActions,
        setVariable('Answer'),
        downloadJson('{baseUrl}', {
          input_mode: 'text',
          session_id: '{SessionID}',
          text: '{Answer}',
        }),
        setVariable('Response'),
        getVariable('Response'),
        getDictionaryValue('session_id'),
        setVariable('SessionID'),
        getVariable('Response'),
        getDictionaryValue('assistant_message'),
        setVariable('Prompt'),
        getVariable('Response'),
        getDictionaryValue('response_type'),
        ifStart('distill-final-check', 'Equals', 'final'),
        getVariable('Response'),
        getDictionaryValue('final_markdown'),
        setVariable('FinalMarkdown'),
        text('{FinalMarkdown}'),
        setClipboard(),
        showResult('{FinalMarkdown}'),
        stop(),
        ifEnd('distill-final-check'),
        repeatEnd('distill-loop'),
        alert('需要重新开始', '已达到 30 轮上限，请重新运行快捷指令。'),
      ],
    },
  };
}

function buildTextShortcutSpec() {
  return buildShortcutShell({
    name: 'ADHD Healing Distill Text',
    iconColor: 4274264319,
    iconGlyph: 59770,
    promptActions: [ask('{Prompt}')],
  });
}

function buildVoiceShortcutSpec() {
  return buildShortcutShell({
    name: 'ADHD Healing Distill Voice',
    iconColor: 4290430695,
    iconGlyph: 61445,
    promptActions: [alert('当前问题', '{Prompt}'), dictateText()],
  });
}

function runOrThrow(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error([stderr, stdout].filter(Boolean).join('\n') || `${command} failed`);
  }
}

async function main() {
  await mkdir(shortcutsDir, { recursive: true });

  const shortcuts = [
    {
      baseName: 'adhd-healing-distill-text',
      spec: buildTextShortcutSpec(),
    },
    {
      baseName: 'adhd-healing-distill-voice',
      spec: buildVoiceShortcutSpec(),
    },
  ];

  for (const { baseName, spec } of shortcuts) {
    const specPath = path.join(shortcutsDir, `${baseName}.json`);
    const unsignedShortcutPath = path.join(shortcutsDir, `${baseName}.unsigned.shortcut`);
    const signedShortcutPath = path.join(shortcutsDir, `${baseName}.shortcut`);

    await writeFile(specPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
    runOrThrow('plutil', ['-convert', 'binary1', '-o', unsignedShortcutPath, specPath]);
    runOrThrow('shortcuts', ['sign', '--mode', 'anyone', '--input', unsignedShortcutPath, '--output', signedShortcutPath]);
    await rm(unsignedShortcutPath, { force: true });

    console.log(`Wrote ${path.relative(repoRoot, specPath)}`);
    console.log(`Wrote ${path.relative(repoRoot, signedShortcutPath)}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});