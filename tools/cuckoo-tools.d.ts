/**
 * Cuckoo Code 工具 API（TypeScript 声明）
 *
 * 本文件描述 ```cuckoo 代码块中可以调用的全部全局函数与数据类型。
 * 运行时由 tools/JsRunner.js 在受限沙箱中注入这些函数；本声明用于帮助
 * AI 理解调用方式，与运行时行为保持一致。
 * 本文件内容与 systemPrompt.md 末尾的「工具 API 类型定义」章节保持同步。
 *
 * 使用规则速览：
 * - 所有工具函数都是异步的，调用时必须写 await
 * - 相对路径基于全局变量 projectDir（当前项目根目录）解析
 * - 多行文本使用反引号（`）模板字符串，不需要任何转义
 * - 工具出错时抛出异常（Error.message 为错误描述），可用 try/catch 处理；
 *   唯一例外是 bash()：不抛异常，通过返回值的 exitCode/error 报告失败
 * - 用 log() 输出中间过程；脚本最后可用 return 返回结果值
 */

/** 当前项目根目录（初始化项目后由系统注入）。未初始化时为 null。 */
declare const projectDir: string | null;

/**
 * 输出中间结果到执行日志（不中断脚本）。
 * 日志内容随执行结果一起回传给 AI。
 */
declare function log(...args: unknown[]): void;

// ================= 文件读写 =================

/** read 的选项 */
interface ReadOptions {
  /** 1-based 起始行号，默认 1 */
  offset?: number;
  /** 最大返回行数，默认 2000，上限 2000 */
  limit?: number;
}

/**
 * 读取 UTF-8 文本文件并返回带行号的内容窗口。
 * 通过 offset 和 limit 分段读取大文件。返回格式化 envelope 文本。
 * @param filePath 相对（基于项目根目录）或绝对路径
 * @param options 可选，offset/limit
 * @throws 文件不存在、不是文件、offset 越界或读取失败时抛出异常
 */
declare function read(filePath: string, options?: ReadOptions): Promise<string>;

/**
 * 创建或完全覆盖 UTF-8 文本文件。
 * 返回格式化 envelope：<path>...</path><type>file</type><content>Created/Updated file</content>
 * @param filePath 相对（基于项目根目录）或绝对路径
 * @param content 完整 UTF-8 文本内容；空字符串合法（写入空文件）
 * @throws 路径为空、写入失败时抛出异常
 */
declare function write(filePath: string, content: string): Promise<string>;

/**
 * 在现有 UTF-8 文本文件中精确替换 old_string 为 new_string。
 * 默认 old_string 必须唯一匹配；多匹配需设置 replaceAll。
 * 返回 Claude-style 确认消息。
 * @param filePath 相对或绝对路径
 * @param oldString 要替换的字面文本
 * @param newString 替换后的字面文本（可空字符串删除匹配）
 * @param replaceAll 是否替换所有匹配，默认 false
 * @throws 文件不存在、old_string 未找到、多匹配未设置 replaceAll、old_string===new_string 时抛出异常
 */
declare function edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<string>;

// ================= 搜索 =================

/**
 * 按 glob 模式递归搜索项目文件，返回相对路径数组（以 / 分隔，如 "src/utils/a.js"）。
 * 自动跳过 node_modules、.git、dist、build 等目录。
 * glob 语法：* 匹配单层内任意字符，** 匹配任意层级目录，? 匹配单个字符。
 */
declare function glob(pattern: string, searchPath?: string): Promise<string[]>;

/** grep 的选项 */
interface GrepOptions {
  /** 搜索起始目录（相对路径），默认项目根目录 */
  path?: string;
  /** 文件名过滤（glob 模式，语法同 glob 函数的 pattern），如 "*.js" */
  glob?: string;
  /** 忽略大小写，默认 false */
  ignoreCase?: boolean;
  /** "content"（默认，返回匹配行）或 "count"（只统计每个文件的匹配数） */
  outputMode?: 'content' | 'count';
  /** 匹配行前后各输出的上下文行数，默认 0 */
  context?: number;
}

/** 单个文件中的匹配结果 */
interface GrepFileMatches {
  /** 匹配文件的相对路径 */
  file: string;
  /** 匹配行列表 */
  matches: { line: number; content: string; context?: boolean }[];
}

/** grep 的返回值（outputMode='content'，默认） */
interface GrepContentResult {
  message: string;
  pattern: string;
  baseDir: string;
  matches: GrepFileMatches[];
  /** 结果数达到上限 200 被截断时为 true */
  truncated: boolean;
}

/** grep 的返回值（outputMode='count'） */
interface GrepCountResult {
  message: string;
  pattern: string;
  baseDir: string;
  /** 文件相对路径 -> 匹配行数 */
  counts: Record<string, number>;
  /** 匹配总行数 */
  totalMatches: number;
}

/**
 * 在项目文件中按正则表达式或文本搜索，返回匹配的文件、行号与行内容。
 * 自动跳过二进制文件、超过 1MB 的文件与 node_modules 等目录。
 * @param pattern 正则表达式或纯文本（搜索纯文本时请转义正则特殊字符）
 * @throws pattern 非法正则时抛出异常
 */
declare function grep(pattern: string, options?: GrepOptions): Promise<GrepContentResult | GrepCountResult>;

// ================= 命令执行 =================

/** bash 的选项 */
interface BashOptions {
  /** 工作目录（相对路径基于项目根目录），默认项目根目录 */
  cwd?: string;
  /** 超时毫秒数，默认 30000 */
  timeout?: number;
}

/** bash 的返回值。注意：bash 不抛异常，失败信息通过 exitCode/error 字段报告。 */
interface BashResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  /** 0 表示成功；非 0 为命令退出码 */
  exitCode: number;
  /** 失败原因（非零退出、超时等），成功时为 null */
  error: string | null;
}

/**
 * 执行 shell 命令（Windows 使用 cmd.exe），返回 stdout/stderr/exitCode。
 * 可用于查看目录、运行构建、安装依赖（npm install）、git 操作等。
 * 输出自动按 UTF-8/GBK 智能解码，不会出现乱码；读取文件内容请优先用 read，
 * 若用 PowerShell 读文件必须加 -Encoding UTF8。
 * 危险命令（format、shutdown、taskkill、diskpart、reg delete、cipher /w 等）会被
 * 安全策略拒绝并抛出异常。
 * 命令非零退出不会抛异常——请检查返回值的 exitCode 与 error。
 */
declare function bash(command: string, options?: BashOptions): Promise<BashResult>;

// ================= 删除 =================

/** deleteFile 的返回值 */
interface FileDeleteResult {
  message: string;
  /** 被删除文件的绝对路径 */
  path: string;
}

/**
 * 删除指定文件（不可恢复，请谨慎使用；只能删除文件，不能删除目录）。
 * @throws 文件不存在或路径不是文件时抛出异常
 */
declare function deleteFile(filePath: string): Promise<FileDeleteResult>;

// ================= WebFetch =================

/** webFetch 的选项 */
interface WebFetchOptions {
  /** HTTP 方法，默认 GET */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  /** 请求头，如 { "Authorization": "Bearer xxx" } */
  headers?: Record<string, string>;
  /** 请求体（POST/PUT 等使用），字符串 */
  body?: string;
  /** 超时毫秒，默认 15000 */
  timeout?: number;
  /** 响应体最大字节数，默认 512000（500KB） */
  maxSize?: number;
  /** 返回格式：auto / json / text */
  responseType?: 'auto' | 'json' | 'text';
}

/** webFetch 的返回值 */
interface WebFetchResult {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  finalUrl: string;
  truncated: boolean;
  elapsedMs: number;
}

/**
 * 访问 http/https 网页或 API，返回结构化结果。
 * 注意：仅支持 http/https，不会执行网页中的 JavaScript。
 * @param url 目标 URL
 * @param options 请求选项
 * @throws URL 非法、超时或请求失败
 */
declare function webFetch(url: string, options?: WebFetchOptions): Promise<WebFetchResult>;
