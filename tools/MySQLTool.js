const { Tool, ToolResult } = require('./ToolRegistry');
const mysql = require('mysql2/promise');

/**
 * MySQL 数据库工具
 * 用于连接 MySQL 数据库并执行 SQL 查询
 */
class MySQLTool extends Tool {
  constructor() {
    super(
      'mysql',
      '连接 MySQL 数据库并执行 SQL 查询。缺少连接参数时应先询问用户。',
      {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'MySQL 服务器主机地址' },
          port: { type: 'integer', description: 'MySQL 服务器端口，默认 3306' },
          user: { type: 'string', description: '登录用户名' },
          password: { type: 'string', description: '登录密码' },
          database: { type: 'string', description: '要连接的数据库名称' },
          query: { type: 'string', description: '要执行的 SQL 查询语句' },
          params: { type: 'array', description: 'SQL 参数化查询的参数数组（可选）' }
        },
        required: ['host', 'user', 'password', 'database', 'query']
      },
      'mysql(options)'
    );
  }

  /**
   * 执行 MySQL 操作
   * @param {Object} params - 参数对象
   * @param {string} params.host - 主机
   * @param {number} params.port - 端口
   * @param {string} params.user - 用户名
   * @param {string} params.password - 密码
   * @param {string} params.database - 数据库名
   * @param {string} params.query - SQL 查询
   * @param {Array} params.params - 参数化查询参数
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    // 检查必要参数
    const required = ['host', 'user', 'password', 'database', 'query'];
    const missing = required.filter(field => !params[field]);
    if (missing.length > 0) {
      return ToolResult.error(`缺少必要参数: ${missing.join(', ')}。请提供完整的 MySQL 连接信息（host, user, password, database）和查询语句。`);
    }

    const { host, port = 3306, user, password, database, query, params: queryParams = [] } = params;

    let connection;
    try {
      // 创建连接
      connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        // 可选：设置连接超时、字符集等
        connectTimeout: 10000,
        charset: 'utf8mb4'
      });

      // 执行查询
      const [rows, fields] = await connection.execute(query, queryParams);

      // 关闭连接
      await connection.end();

      // 返回结果（限制数据量防止过大）
      const result = {
        rowCount: rows.length,
        fields: fields ? fields.map(f => f.name) : [],
        rows: rows.slice(0, 1000) // 最多返回 1000 行
      };

      return ToolResult.success(result);
    } catch (err) {
      // 确保连接关闭
      if (connection) {
        try { await connection.end(); } catch (_) {}
      }
      return ToolResult.error(`MySQL 执行失败: ${err.message}`);
    }
  }
}

module.exports = { MySQLTool };