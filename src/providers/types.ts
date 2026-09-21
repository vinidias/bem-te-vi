/**
 * Provider 接口定义
 * 内置与自定义 provider 统一实现此接口；加载时用 validate.ts 做运行时校验
 * （TS 类型运行时被擦除，强制靠校验函数 —— D14）。
 */

/** 输入框元素 */
export interface InputElement {
  tagName?: string;
  isContentEditable?: boolean;
  disabled?: boolean;
  focus?: () => void;
  click?: () => void;
}

/** 平台 Provider 接口 */
export interface Provider {
  /** 平台唯一标识，如 'my-platform' */
  id: string;
  /** 显示名称 */
  name: string;
  /** 首页地址 */
  homeUrl: string;
  /** 会话 URL 前缀 */
  sessionUrlBase: string;

  /** 输入框查找选择器（按优先级排序） */
  inputSelectors?: string[];
  /** 发送按钮查找选择器 */
  sendButtonSelectors?: string[];
  /** 用户信息选择器 */
  userInfoSelector?: string;
  /** 首页判断正则 */
  homeUrlPattern?: RegExp;
  /** 输入框关键词兜底 */
  inputKeywords?: string[];

  /** 从 URL 提取会话 ID */
  extractSessionId(url: string): string | null;
  /** 判断 URL 是否属于本平台 */
  matchesUrl(url: string): boolean;

  /** 是否使用网络拦截模式（默认 false = DOM 抓取） */
  useIntercept?: boolean;
  /** 返回注入主世界的网络拦截器源码（拦截模式使用，必须自包含） */
  getHookSource?(): string;
  /** 返回自定义提示词模板（优先级最高；返回空则回退到文件模板） */
  getPromptTemplate?(): string;

  findInput?(): InputElement | null;
  findSendButton?(): InputElement | null;
  extractUserInfo?(): string;
  isElementVisible?(el: Element): boolean;
}
