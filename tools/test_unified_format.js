/**
 * 测试统一工具调用格式解析
 */

const { WebContentCapturer } = require('./WebContentCapturer');
const { UnifiedToolManager } = require('./UnifiedToolManager');

async function test() {
  console.log('=== 测试工具调用解析 ===\n');

  // 创建 toolManager 实例
  const toolManager = new UnifiedToolManager();

  // 创建 parser 实例
  const parser = new WebContentCapturer(toolManager);

  // 测试用例
  const testCases = [
    {
      name: '标准格式 JSON (toolName/params)',
      content: '{"toolName": "file_write", "params": {"file_path": "test.txt", "content": "hello"}, "callId": "call_123"}'
    },
    {
      name: 'AI 回复格式 (tool/parameters)',
      content: '{"tool": "file_write", "parameters": {"file_path": "C:\\\\d\\\\SourceCode\\\\2026\\\\at-geo-web\\\\abc.json", "content": ""}}'
    },
    {
      name: 'JSON 代码块',
      content: '```json\n{"toolName": "file_write", "params": {"file_path": "test.txt", "content": "hello"}}\n```'
    },
    {
      name: 'tool 代码块',
      content: '```tool\n{"toolName": "file_write", "params": {"file_path": "test.txt", "content": "hello"}}\n```'
    },
    {
      name: '无代码块标记的 JSON',
      content: '{"toolName": "file_write", "params": {"file_path": "test.txt", "content": "hello"}}'
    },
    {
      name: '包含额外文本',
      content: '我要写入文件：\n```json\n{"toolName": "file_write", "params": {"file_path": "test.txt", "content": "hello"}}\n```\n请执行。'
    },
    {
      name: 'AI 回复风格',
      content: '好的，我来帮你写入文件。\n\n```json\n{\n  "toolName": "file_write",\n  "params": {\n    "file_path": "src/utils/helper.js",\n    "content": "export function formatDate(date) {\\n  return date.toISOString().split(\\"T\\")[0];\\n}"\n  },\n  "callId": "call_1700000001_abc123"\n}\n```\n\n文件已写入。'
    },
    {
      name: '错误格式 - 缺少 toolName',
      content: '{"params": {"file_path": "test.txt", "content": "hello"}}'
    },
    {
      name: '普通文本（非工具调用）',
      content: '这是一段普通的回复，不包含工具调用。'
    }
  ];

  for (const tc of testCases) {
    console.log(`\n--- ${tc.name} ---`);
    console.log('输入:', tc.content.substring(0, 80) + (tc.content.length > 80 ? '...' : ''));

    const result = parser.parseToolCall(tc.content);
    if (result) {
      console.log('✅ 解析成功:');
      console.log('  toolName:', result.toolName);
      console.log('  params:', JSON.stringify(result.params));
      console.log('  callId:', result.callId);
    } else {
      console.log('❌ 未识别为工具调用');
    }
  }

  // 测试工具执行
  console.log('\n=== 测试工具执行 ===\n');
  const testToolCall = {
    toolName: 'file_write',
    params: {
      file_path: 'test_output.txt',
      content: '测试内容\n测试时间: ' + new Date().toISOString()
    },
    callId: 'test_call_001'
  };

  console.log('执行工具:', testToolCall.toolName);
  const result = await toolManager.execute(testToolCall);
  console.log('执行结果:', result.success ? '✅ 成功' : '❌ 失败');
  console.log('数据:', result.data);
  console.log('错误:', result.error);

  // 验证文件
  const fs = require('fs');
  if (fs.existsSync('test_output.txt')) {
    const content = fs.readFileSync('test_output.txt', 'utf-8');
    console.log('\n文件内容验证:');
    console.log(content);
    fs.unlinkSync('test_output.txt');
    console.log('测试文件已清理');
  }

  console.log('\n=== 测试完成 ===');
}

test().catch(console.error);