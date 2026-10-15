# 提示词模式与版式合同

## 统一风格前缀

将下面内容放在每页提示词的 Style/medium 和 Constraints 中，之后再写页面专属内容：

```text
Finished widescreen Chinese PowerPoint slide image, 16:9. Use the supplied image only as a style reference. Cream paper background with subtle paper grain, fine gray pencil outline, lightly imperfect hand-drawn rounded frame, black legible handwritten Chinese, pale blue pencil underline below the title. Use restrained colored-pencil fills: light blue, light green, pale peach-orange, and pale yellow. Friendly hand-drawn people and object illustrations, generous whitespace, clear hierarchy, high legibility. Do not use modern glossy UI, dark tech background, neon, 3D lighting, stock photography, gradients, logos, watermarks, page numbers, or cropped borders. Leave the upper-right corner empty.
```

## 页面提示词模板

```text
Use case: productivity-visual
Asset type: finished widescreen Chinese PowerPoint slide image, 16:9
Primary request: <一句话说清本页要让观众理解什么>
Input images:
- Image 1: style reference only; copy its line quality, paper, palette, composition rhythm, and illustration feel. Replace all original content.
- Image 2: subject/case reference only (optional); preserve only the supplied object's appearance and labels.
Style/medium: <统一风格前缀>
Composition/framing: <标题区比例；主体分区；从哪里到哪里有箭头；哪些对象并列；哪些线是支撑关系；底部结论条和留白>
Text (verbatim):
- Title: "<exact Chinese title>"
- Subtitle: "<exact subtitle>"
- Section labels: "..."
- Body labels: "..."
- Footnotes: "..."
Accuracy constraints:
- <parallel items remain parallel>
- <shared foundation is drawn as support, not an output step>
- <human confirmation / approval gate, if applicable>
- <version or product scope>
Avoid: <specific errors found in this page>
```

## 箭头和关系语法

| 关系 | 画法 | 例子 |
|---|---|---|
| 先后流程 | 一根方向明确的黄色或黑色箭头 | 提交 → 审批 → 付款 |
| 并列能力/资料 | 同一容器内同级图标，无相互箭头 | 发票、差旅行程、付款资料 |
| 共同底座 | 底部横向浅绿带，两条短虚线或支撑线连接使用者 | 报销人和审批人共同遵循规则 |
| 安装交付 | 能力包指向使用入口；底座另画支撑线 | Agent/Skill/MCP/知识库 → CoCoAI；Lumen 承托 |
| 反馈更新 | 使用反馈 → 构建/验证 → 发布版本 → 使用者更新 | 培训反馈或产品能力迭代 |
| 需人工确认的动作 | 结果复核 → 负责人确认 → 执行动作 | 审批确认后付款、确认后创建草稿 |

不要用串行箭头表示并列资料。不要让共同底座成为流程最后一步。不要把“建议”“待确认”画成“已批准”或“已执行”。

## 内容密度

- 标题通常只表达一个主题；副标题解释范围，不重复标题。
- 一个图形区保留少量短标签；详细事实放在讲者备注或下一页。
- 比较表每格保持一到三行；读不清时拆页，不压缩到极小字体。
- 中文长词在提示词中明确“逐字准确”，必要时将关键标签分行或单字竖排。
- 每页只保留一个结论条；不要加入没有证据的营销口号。

## 示例：通用产品架构页

```text
Page purpose: 让客户看懂构建端、使用端和共同治理底座的职责边界。
Composition: 左侧是实施/开发角色与构建工作台，右侧是业务使用者与应用入口，中间是可安装能力包，底部是共同底座。能力包向使用入口有一条交付箭头；底座分别向构建端和使用端画支撑线。
Text (verbatim):
- “构建端”：按现场需求定制与验收
- “能力包”：Agent、Skill、连接器、知识库
- “使用端”：安装后完成业务工作
- “共同底座”：资源、版本、权限与运行记录
Accuracy constraint: 不把底座画成业务工作流的一步，不把能力包画成第四个产品。
```
