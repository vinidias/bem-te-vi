/**
 * DSH 兼容层：把 @deepseek-ai/dsh-tools 的 defineTool 转成 Cuckoo 工具描述。
 * 纯 node，无 electron 依赖（P1-a 可独立测试）。
 */

/** DSH 参数属性规格 */
interface DshParamProp {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'json';
  required?: boolean;
  description?: string;
  title?: string;
  default?: any;
  enum?: any[];
  items?: any;
  properties?: any;
  additionalProperties?: boolean;
}

/** DSH defineTool 的入参 */
interface DshDefineToolOptions {
  name: string;
  description: string;
  parameters?: Record<string, DshParamProp>;
  output?: { schema?: any; render?: (args: any, value: any) => any[] };
  execute: (args: any, exec: any) => Promise<any> | any;
  timeoutMs?: number;
}

/** Cuckoo 工具定义（比 DSH 简化：name/description/parameters(JSON Schema)/execute）*/
interface CuckooTool {
  name: string;
  description: string;
  parameters: any;   // JSON Schema（object）
  execute: (args: any) => Promise<any>;
}

/**
 * 把 DSH 的"值 schema"（每层可有 required:true 方言）递归转成标准 JSON Schema。
 * 关键：每层的 required:true 提取到该层的 required: [] 数组；去掉非标准字段。
 */
function dshValueToJsonSchema(spec: any): any {
  if (!spec || typeof spec !== 'object') return {};
  const t = spec.type || 'string';
  const node: any = { type: t === 'json' ? 'object' : t };
  if (spec.description) node.description = spec.description;
  if (spec.title) node.title = spec.title;
  if (spec.default !== undefined) node.default = spec.default;
  if (spec.examples !== undefined) node.examples = spec.examples;
  if (Array.isArray(spec.enum)) node.enum = spec.enum;
  if (spec.const !== undefined) node.const = spec.const;
  if (t === 'array') {
    node.items = spec.items ? dshValueToJsonSchema(spec.items) : {};
  } else if (t === 'object') {
    const inner = dshParamsToJsonSchema(spec.properties, spec.additionalProperties);
    node.properties = inner.properties;
    node.required = inner.required;
    node.additionalProperties = inner.additionalProperties;
  } else if (spec.oneOf) {
    node.oneOf = spec.oneOf.map((s: any) => dshValueToJsonSchema(s));
  }
  return node;
}

/** DSH 参数映射 → JSON Schema（隐式 open object；required 是每属性标注 → 提取为数组）*/
function dshParamsToJsonSchema(params: Record<string, DshParamProp> | undefined, additionalProperties?: boolean): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(params || {})) {
    properties[key] = dshValueToJsonSchema(spec);
    if (spec.required) required.push(key);
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: additionalProperties !== false,
  };
}

/** DSH defineTool → Cuckoo 工具描述 */
function defineTool(options: DshDefineToolOptions): CuckooTool {
  if (!options || typeof options.name !== 'string' || !options.name) {
    throw new Error('defineTool: name 必须是非空字符串');
  }
  if (typeof options.description !== 'string') {
    throw new Error('defineTool(' + options.name + '): description 必须是字符串');
  }
  if (typeof options.execute !== 'function') {
    throw new Error('defineTool(' + options.name + '): execute 必须是函数');
  }
  return {
    name: options.name,
    description: options.description,
    parameters: dshParamsToJsonSchema(options.parameters),
    execute: async (args: any) => {
      // exec 用 stub 兜底：插件调 exec.agent.session.append(...) 等不抛错（副作用空转）
      const value = await options.execute(args || {}, makeStub('exec'));
      // DSH 的 output.render 把值转成 ContentBlock[]；Cuckoo 工具返回字符串即可
      if (options.output && typeof options.output.render === 'function') {
        try {
          const blocks = options.output.render(args || {}, value);
          if (Array.isArray(blocks)) {
            return blocks.map((b: any) => (b && typeof b.text === 'string') ? b.text : '').join('');
          }
        } catch (_) { /* 回退：直接返回原值 */ }
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

/**
 * 万能空接口（stub）：Proxy 包装的函数——任何属性访问/调用/构造都返回新 stub，永不抛错。
 * 用于填补 DSH 框架内部模块与 ctx 上的空服务。
 */
function makeStub(name: string): any {
  const fn: any = function () { return p; };
  const p: any = new Proxy(fn, {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      if (prop === '__esModule') return false;
      if (prop === 'default') return p;
      if (prop === 'toString') return () => '[dsh-stub ' + name + ']';
      if (prop === Symbol.toPrimitive) return () => name;
      return makeStub(name + '.' + String(prop));
    },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}

/** schemastery / zod 的"够用空"（模块初始化不抛；校验被跳过） */
const z: any = makeStub('z');

/** DSH cordis 的 Service 基类（P1 简化占位；P2 补真实现）*/
class Service {
  ctx: any;
  name: string;
  constructor(ctx: any, name: string) {
    this.ctx = ctx;
    this.name = name;
  }
}

export { defineTool, dshParamsToJsonSchema, dshValueToJsonSchema, Service, makeStub, z };
export type { DshDefineToolOptions, DshParamProp, CuckooTool };
