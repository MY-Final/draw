## ADDED Requirements

### Requirement: 素材收藏
系统 SHALL 允许用户将素材标记为收藏或取消收藏,收藏状态本地持久化,并随整库导出一并保留。

#### Scenario: 标记收藏
- **WHEN** 用户点击某素材的收藏
- **THEN** 系统持久化其收藏状态,再次打开仍保持

#### Scenario: 按收藏筛选
- **WHEN** 用户开启"仅看收藏"
- **THEN** 素材库仅显示已收藏的素材
