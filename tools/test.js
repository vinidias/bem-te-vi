/**
 * 测试工具库
 */
const path = require('path');
const fs = require('fs');
const { ToolRegistry, ToolResult } = require('./ToolRegistry');
const { FileWriteTool } = require('./FileWriteTool');

async function test() {
  console.log('=== 测试工具库 ===\n');

  // 创建注册表
  const registry = new ToolRegistry();

  // 注册工具
  registry.register(new FileWriteTool());

  console.log(`\n已注册工具数量: ${registry.size()}`);
  console.log(`工具列表: ${registry.listNames().join(', ')}\n`);

  // 测试获取工具描述（用于发送给 AI）
  console.log('=== 工具描述 (用于 System Prompt) ===');
  console.log(registry.getFormattedToolsForPrompt());

  // 测试执行工具
  console.log('\n=== 测试执行 file_write ===');

  // 写入测试文件
  const testFile = path.join(__dirname, '..', 'test_output.txt');
  const testContent = `这是一个测试文件
创建时间: ${new Date().toISOString()}
工具库测试成功!`;

  const result = await registry.execute('file_write', {
    file_path: testFile,
    content: testContent
  });

  console.log('执行结果:', result.toString());

  // 验证文件是否存在
  const fs = require('fs');
  if (fs.existsSync(testFile)) {
    const readContent = fs.readFileSync(testFile, 'utf-8');
    console.log('\n文件内容验证:');
    console.log(readContent);
    // 清理测试文件
    fs.unlinkSync(testFile);
    console.log('\n测试文件已清理');
  }

  console.log('\n=== 测试完成 ===');
}

test().catch(console.error);

let content = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n<!DOCTYPE mapper PUBLIC \"-//mybatis.org//DTD Mapper 3.0//EN\" \"http://mybatis.org/dtd/mybatis-3-mapper.dtd\">\r\n<mapper namespace=\"com.wupaas.boot.admin.repository.vintage.VintageResultRepository\">\r\n\r\n    <insert id=\"batchUpsert\">\r\n        INSERT INTO vintage_result\r\n        (product, rate_group, overdue_days, mob_seq, grant_month, day_option,\r\n         vintage_value, numerator, denominator, observe_date, denominator_date)\r\n        VALUES\r\n        <foreach collection=\"list\" item=\"item\" separator=\",\">\r\n            (#{item.product}, #{item.rateGroup}, #{item.overdueDays}, #{item.mobSeq},\r\n             #{item.grantMonth}, #{item.dayOption}, #{item.vintageValue}, #{item.numerator},\r\n             #{item.denominator}, #{item.observeDate}, #{item.denominatorDate})\r\n        </foreach>\r\n \n    </insert>\r\n\r\n    <select id=\"selectVintageTable\" resultType=\"java.util.HashMap\">\r\n        SELECT\r\n            grant_month AS grantMonth,\r\n            denominator AS denominator,\r\n            mob_seq AS mobSeq,\r\n            vintage_value AS vintageValue,\r\n            numerator AS numerator,\r\n            observe_date AS observeDate\r\n        FROM vintage_result\r\n        WHERE product = #{product}\r\n          AND rate_group = #{rateGroup}\r\n          AND overdue_days = #{overdueDays}\r\n          AND CAST(RIGHT(observe_date, 2) AS UNSIGNED) =\r\n              LEAST(CAST(#{dayOption} AS UNSIGNED),\r\n                    DAY(LAST_DAY(STR_TO_DATE(observe_date, '%Y%m%d'))))\r\n        ORDER BY grant_month, mob_seq\r\n    </select>\r\n\r\n    <select id=\"selectVintageChart\" resultType=\"java.util.HashMap\">\r\n        SELECT\r\n            product,\r\n            grant_month AS grantMonth,\r\n            vintage_value AS vintageValue,\r\n            numerator,\r\n            denominator,\r\n            observe_date AS observeDate\r\n        FROM vintage_result\r\n        WHERE rate_group = #{rateGroup}\r\n          AND overdue_days = #{overdueDays}\r\n          AND mob_seq = #{mobSeq}\r\n          AND CAST(RIGHT(observe_date, 2) AS UNSIGNED) =\r\n              LEAST(CAST(#{dayOption} AS UNSIGNED),\r\n                    DAY(LAST_DAY(STR_TO_DATE(observe_date, '%Y%m%d'))))\r\n          <if test=\"product != null and product != ''\">\r\n              AND product = #{product}\r\n          </if>\r\n        ORDER BY product, grant_month\r\n    </select>\r\n\r\n    <!-- 查询最大观察日，用于\"最新\"筛选 -->\r\n    <select id=\"selectMaxObserveDate\" resultType=\"string\">\r\n        SELECT MAX(observe_date) FROM vintage_result\r\n        WHERE product = #{product}\r\n          AND rate_group = #{rateGroup}\r\n          AND overdue_days = #{overdueDays}\r\n    </select>\r\n\r\n    <select id=\"selectMaxObserveDateForChart\" resultType=\"string\">\r\n        SELECT MAX(observe_date) FROM vintage_result\r\n        WHERE rate_group = #{rateGroup}\r\n          AND overdue_days = #{overdueDays}\r\n          AND mob_seq = #{mobSeq}\r\n          <if test=\"product != null and product != ''\">\r\n              AND product = #{product}\r\n          </if>\r\n    </select>\r\n\r\n    <!-- 分母查询：从最新002全量快照按发放月份分组求和 -->\r\n    <select id=\"selectDenominatorGrouped\" resultType=\"java.util.HashMap\">\r\n        SELECT grant_month AS grantMonth, SUM(amount) AS denominator FROM (\r\n        <foreach collection=\"tables\" item=\"tbl\" separator=\" UNION ALL \">\r\n            SELECT LEFT(REPLACE(f1, '-', ''), 6) AS grant_month,\r\n                   ${tbl.amountExpr} AS amount\r\n            FROM lhd.${tbl.fullName}\r\n            WHERE f1 >= #{earliestGrantMonthStart}\r\n                and f1 >= '202601'\r\n            <if test=\"needFilter\">AND f10 != '保证'</if>\r\n            <if test=\"rateType == 'HIGH'\">AND ${tbl.rateExpr} > 18</if>\r\n            <if test=\"rateType == 'LOW'\">AND ${tbl.rateExpr} <![CDATA[ <= ]]> 18</if>\r\n        </foreach>\r\n        ) t GROUP BY grant_month\r\n    </select>\r\n\r\n    <!-- 分子查询：逾期余额按发放月份分组 -->\r\n    <select id=\"selectNumeratorGrouped\" resultType=\"java.util.HashMap\">\r\n        SELECT grant_month AS grantMonth, SUM(balance) AS balance FROM (\r\n        <foreach collection=\"tables\" item=\"tbl\" separator=\" UNION ALL \">\r\n            SELECT LEFT(REPLACE(f16, '-', ''), 6) AS grant_month,\r\n                   ${tbl.amountExpr} AS balance\r\n            FROM lhd.${tbl.fullName}\r\n            WHERE f26 >= #{overdueDay}\r\n            and f16 >= '20260101'\r\n            and f16 >= ${disbursementDate}\r\n            <if test=\"needFilter\">AND f21 != '保证'</if>\r\n            <if test=\"rateType == 'HIGH'\">AND ${tbl.rateExpr} > 18</if>\r\n            <if test=\"rateType == 'LOW'\">AND ${tbl.rateExpr} <![CDATA[ <= ]]> 18</if>\r\n        </foreach>\r\n        ) t GROUP BY grant_month\r\n    </select>\r\n\r\n    <!-- 汇总产品：从子产品数据聚合写入 -->\r\n    <insert id=\"insertSummary\">\r\n        INSERT INTO vintage_result (product, rate_group, overdue_days, mob_seq, grant_month, day_option,\r\n            vintage_value, numerator, denominator, observe_date, denominator_date)\r\n        SELECT '汇总', rate_group, overdue_days, mob_seq, grant_month, day_option,\r\n            CASE WHEN SUM(denominator) &gt; 0\r\n                 THEN ROUND(SUM(numerator) / SUM(denominator) * 100, 4) END,\r\n            COALESCE(SUM(numerator), 0),\r\n            COALESCE(SUM(denominator), 0),\r\n            MAX(observe_date),\r\n            MAX(denominator_date)\r\n        FROM vintage_result\r\n        WHERE product != '汇总'\r\n        GROUP BY rate_group, overdue_days, mob_seq, grant_month, day_option\r\n        ON DUPLICATE KEY UPDATE\r\n            vintage_value = VALUES(vintage_value),\r\n            numerator = VALUES(numerator),\r\n            denominator = VALUES(denominator),\r\n            observe_date = VALUES(observe_date),\r\n            denominator_date = VALUES(denominator_date),\r\n            update_time = CURRENT_TIMESTAMP\r\n    </insert>\r\n\r\n</mapper>\r\n"
let old_string = "test/VintageResultMapping.xml\",\"old_string\":\"        ON DUPLICATE KEY UPDATE\\n            vintage_value = VALUES(vintage_value),\\n            numerator = VALUES(numerator),\\n            denominator = VALUES(denominator),\\n            observe_date = VALUES(observe_date),\\n            denominator_date = VALUES(denominator_date),\\n            update_time = CURRENT_TIMESTAM"