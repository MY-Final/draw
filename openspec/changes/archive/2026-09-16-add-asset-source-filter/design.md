## Context

素材来源此前未记录。素材库同时存在生成图、上传图与导入图,需要来源维度以便区分与筛选。

## Goals / Non-Goals

**Goals**
- 每张素材有明确来源,并可据此筛选。
- 旧素材(无 `source`)平滑归入 AI 生成。

**Non-Goals**
- 不做按来源批量删除或导出。
- 不改动既有引用感知删除规则。

## Decisions

### D1:三种来源,缺失按 generated 归一化
`asset.source` 取 `generated` / `reference-uploaded` / `imported`。`normalizeSource` 对未知或缺失值一律返回 `generated`——老版本只会产生生成图,归入生成图最稳。

### D2:角标用短标签,筛选用全标签
格子角标用 `SOURCE_SHORT_LABEL`(AI / 上传 / 导入)节省空间;筛选器用 `SOURCE_FULL_LABEL`(AI 生成 / 我的上传 / 导入)表达清晰。

## Risks / Trade-offs

- **导入素材的来源语义**:整库导入的图统一记为 `imported`,即便其在源设备上本是生成图。权衡:以"进入本机的途径"为准,简单一致。

## Migration Plan

无数据迁移。读取时归一化,旧记录无需改写。
