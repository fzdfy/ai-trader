# source-standard-governance Specification

## Purpose

固定外部数据来源标准版本，使 Skill 或规范升级可被及时发现、评估和受控采用，同时保持生产取数不依赖 Agent Skill 运行。

## Requirements

### Requirement: Source standards are pinned

系统 SHALL 为每个外部来源标准记录固定版本、来源地址、checksum、审阅时间和适用能力范围。

#### Scenario: Runtime resolves a source standard
- **WHEN** 系统读取 Provider 能力的来源标准
- **THEN** 系统 MUST 返回固定版本而不是浮动 latest 版本

### Requirement: Production remains independent from Agent Skills

生产取数 SHALL 由仓库 Provider、注册表和配置执行，不得在运行时加载 Agent Skill。

#### Scenario: The external Skill is unavailable
- **WHEN** `a-stock-data` Skill 文件被删除或暂时不可访问
- **THEN** 现有生产取数 MUST 继续按仓库固定实现运行

### Requirement: Source standard updates are monitored

系统 SHALL 至少每 24 小时检查一次固定来源标准是否出现新版本或内容校验变化。

#### Scenario: A new standard version is detected
- **WHEN** 检测结果与固定版本或 checksum 不一致
- **THEN** 系统 MUST 记录检测任务并创建人工审阅 Work Task

### Requirement: Detection does not auto-deploy changes

来源标准变化 MUST NOT 自动修改 Provider、注册表、限流参数或生产配置。

#### Scenario: A monitored standard changes
- **WHEN** 系统发现新版本
- **THEN** 系统 MUST 保持当前生产实现不变，直到完成评审和发布

### Requirement: Upgrades follow impact-based gates

来源标准升级 SHALL 按文档变化、兼容新增、行为变化和破坏性变化分类，并执行相应的契约测试和兼容性验证。

#### Scenario: A breaking endpoint change is found
- **WHEN** 新版本修改已使用端点、字段、限流或降级规则
- **THEN** 升级 MUST 通过 OpenSpec、契约测试和必要的双版本对比后才能发布

### Requirement: Capability mappings carry standard versions

系统 SHALL 将来源标准版本关联到具体 Provider 能力、数据资产和同步任务。

#### Scenario: A capability is reviewed
- **WHEN** 治理控制台显示某个数据能力
- **THEN** 页面 MUST 显示其采用的来源标准版本和最近审阅时间
