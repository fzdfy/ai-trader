# 数据治理资产目录

> 此文件由治理注册表自动生成，请勿手工编辑。

资产总数：100

| 资产 | 名称 | 数据域 | Tier | Data Owner | Data Steward | Source Standard | 分类 | 保留 |
|---|---|---|---|---|---|---|---|---|
| `account` | 认证账户 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `adj_factor` | 复权因子 | market_raw | tier_0 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `adj_factor_latest` | 最新复权因子快照 | market_raw | tier_0 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `admin_operation_audit` | 管理员操作审计 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `analyst_consensus_snapshot` | 一致预期快照 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `bar_period_adj` | 周期复权线 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `bar1d_adj_legacy` | 历史复权线旧表 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `bar1d_hfq` | 后复权日线视图 | research_derived | tier_0 | Data Platform | Quant Research | — | internal | permanent |
| `bar1d_qfq` | 前复权日线视图 | research_derived | tier_1 | Data Platform | Quant Research | — | internal | permanent |
| `bar1d_raw` | 原始日线 | market_raw | tier_0 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `bar1m_adj` | 分钟复权线 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `board` | 板块排行 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `board_constituent` | 板块成分股 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `board_fund_flow_period` | 板块资金流 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `board_history` | 板块排行历史 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `board_kline` | 板块指数日 K | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `company_announcement` | 公司公告 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `data_gap` | 数据缺口 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `data_incident` | 数据事故 | application | tier_2 | Agent Platform | Quant Research | — | internal | permanent |
| `data_incident_event` | 数据事故事件 | application | tier_2 | Agent Platform | Quant Research | — | internal | permanent |
| `data_quality_result` | 数据质量证据 | application | tier_2 | Agent Platform | Quant Research | — | internal | permanent |
| `dragon_tiger_daily` | 龙虎榜 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `factor_evaluation` | 因子评价 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `factor_iteration` | 因子迭代结果 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `factor_registry` | 因子注册表 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | rebuildable |
| `feature_set` | 特征集 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | rebuildable |
| `feature_value` | 特征值 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `fund_flow_rank` | 个股资金流排行 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `hot_reason` | 题材归因 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `instrument` | 交易标的基础信息 | reference | tier_0 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `job_run` | 任务运行记录 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `limit_up_pool` | 涨停池 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `mastra_agent_versions` | Agent 运行时 · agent_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_agents` | Agent 运行时 · agents | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_ai_spans` | Agent 运行时 · ai_spans | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_background_tasks` | Agent 运行时 · background_tasks | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_channel_config` | Agent 运行时 · channel_config | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_channel_installations` | Agent 运行时 · channel_installations | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_dataset_items` | Agent 运行时 · dataset_items | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_dataset_versions` | Agent 运行时 · dataset_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_datasets` | Agent 运行时 · datasets | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_experiment_results` | Agent 运行时 · experiment_results | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_experiments` | Agent 运行时 · experiments | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_favorites` | Agent 运行时 · favorites | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_mcp_client_versions` | Agent 运行时 · mcp_client_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_mcp_clients` | Agent 运行时 · mcp_clients | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_mcp_server_versions` | Agent 运行时 · mcp_server_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_mcp_servers` | Agent 运行时 · mcp_servers | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_messages` | Agent 运行时 · messages | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_notifications` | Agent 运行时 · notifications | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_observational_memory` | Agent 运行时 · observational_memory | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_prompt_block_versions` | Agent 运行时 · prompt_block_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_prompt_blocks` | Agent 运行时 · prompt_blocks | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_resources` | Agent 运行时 · resources | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_schedule_triggers` | Agent 运行时 · schedule_triggers | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_schedules` | Agent 运行时 · schedules | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_scorer_definition_versions` | Agent 运行时 · scorer_definition_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_scorer_definitions` | Agent 运行时 · scorer_definitions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_scorers` | Agent 运行时 · scorers | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_skill_blobs` | Agent 运行时 · skill_blobs | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_skill_versions` | Agent 运行时 · skill_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_skills` | Agent 运行时 · skills | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_threads` | Agent 运行时 · threads | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_tool_provider_connections` | Agent 运行时 · tool_provider_connections | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_workflow_definitions` | Agent 运行时 · workflow_definitions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_workflow_snapshot` | Agent 运行时 · workflow_snapshot | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_workspace_versions` | Agent 运行时 · workspace_versions | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `mastra_workspaces` | Agent 运行时 · workspaces | application | tier_2 | Agent Platform | Quant Research | — | restricted | duration |
| `news_article` | 新闻文章 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `news_article_symbol` | 新闻个股关联 | market_intelligence | tier_2 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `news_embedding` | 新闻向量 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `news_event` | 新闻事件 | market_intelligence | tier_2 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `news_event_symbol` | 事件个股关联 | market_intelligence | tier_2 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `quote_latest` | 最新行情快照 | market_raw | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `quote_snapshot` | 盘口快照历史 | market_raw | tier_2 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `research_report` | 研究报告 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | restricted | permanent |
| `research_report_chunk` | 研报分块 | research_derived | tier_2 | Data Platform | Quant Research | — | restricted | permanent |
| `research_report_document` | 研报 PDF 文档 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | restricted | permanent |
| `research_report_forecast` | 研报预测 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `review_daily` | 每日复盘 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `review_skill` | 复盘规则 | application | tier_2 | Agent Platform | Quant Research | — | internal | rebuildable |
| `session` | 用户会话 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `stock_analysis_snapshot` | 个股分析快照 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `stock_financial_snapshot` | 财务快照 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `stock_metric` | 股票指标 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | permanent |
| `stock_pool` | 股票池 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `stock_valuation_daily` | 估值历史 | market_intelligence | tier_1 | Data Platform | Quant Research | a-stock-data | internal | permanent |
| `strategy_config` | 策略配置 | research_derived | tier_2 | Data Platform | Quant Research | — | internal | rebuildable |
| `symbol_subscription` | 标的订阅 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `sync_cursor` | 同步游标 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `trading_calendar` | 交易日历 | reference | tier_0 | Data Platform | Quant Research | — | internal | permanent |
| `user` | 用户账户 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `verification` | 验证记录 | application | tier_2 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `watchlist` | 用户自选 | application | tier_1 | Agent Platform | Quant Research | — | restricted | rebuildable |
| `work_task` | 治理任务 | application | tier_2 | Agent Platform | Quant Research | — | internal | permanent |
| `work_task_event` | 治理任务事件 | application | tier_2 | Agent Platform | Quant Research | — | internal | permanent |
| `workflow_definition` | 工作流定义 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `workflow_node_run` | 工作流节点运行 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `workflow_run` | 工作流运行 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
| `workflow_version` | 工作流版本 | application | tier_1 | Agent Platform | Quant Research | — | internal | rebuildable |
