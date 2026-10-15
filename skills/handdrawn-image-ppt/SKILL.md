---
name: handdrawn-image-ppt
description: "Use when Chinese training, product introduction, business proposal, or supplementary slides need a hand-drawn style with cream paper, pencil sketches and pastel colored pencils, especially when an image model generates whole slides. 适用于米白纸纹、彩铅手绘风格的中文培训、产品介绍和业务方案 PPT。"
---

# 手绘图片型 PPT

生成整页幻灯片图片，逐页修正，再打包为图片版 PPTX。适用于培训、产品介绍、客户方案与原稿补充；主题、案例、页数和模型由当前任务决定。整页 PNG 不具备逐项编辑能力；要求可编辑内容时结合 presentations skill 重建原生对象。

## 固定风格

先用 `view_image` 查看 [总览参考](assets/style-reference.png)；比较页可看 [表格参考](assets/comparison-reference.png)，底层逻辑架构可看 [架构参考](assets/architecture-reference.png)。它们只提供画风，原有品牌和业务内容不得自动带入新主题。

- 横版 16:9，米白轻纸纹，细灰铅笔线，轻微自然抖动的圆角外框。
- 工整黑色手写中文，大标题下浅蓝彩铅划线，正文清楚可读。
- 浅蓝、浅绿、浅橙分区，浅黄结论条；彩铅排线、手绘人物和实物，保持留白。
- 默认右上角留空，无 LEAD、其他 logo、水印和页码，供用户后加标志。用户另有品牌要求时使用其真实素材。
- 并列项同级摆放，共同底座用独立支撑线连接两端，流程箭头只表达明确先后关系。

使用 [提示词模式](references/prompt-patterns.md) 的统一前缀，避免变成科技 UI、霓虹、玻璃卡片、3D 或照片。

## 执行顺序

1. **读内容与原稿。** 明确受众、总页数、页面目的、真实事实与案例。原稿补充只增加未讲清的内容，记录原插入位置；保留原稿。产品/竞品事实按官方资料核实，具体边界见 [内容准确性](references/content-accuracy.md)。
2. **建立页清单。** 用 [manifest 契约](references/packaging.md) 固定页序、标题、提示词、PNG、来源与讲者备注。页数按用户要求，结构按主题选，不能把本次 10 页或 E37 案例固化到未来任务。
3. **逐页写提示词。** 统一风格前缀 + 本页布局 + 全部逐字上屏文案 + 关系约束。把样式参考和主题参考的用途写清楚；内容说明与布局指令不要印到画面。
4. **选择模型并生成。** 默认用 imagegen 内置能力。用户指定端点/模型/API 时按 [供应商与凭据](references/provider-and-secrets.md) 使用 bundled CLI 或该供应商官方工具。已授权全部生成时持续完成全部页；不再停在少量样张。独立页可并行，成功页落盘，续跑只处理缺页或未通过页。
5. **看图并局部修图。** 逐页检查中文、箭头、关系、案例、纸纹、配色和 logo；按 [检查清单](references/qa-and-delivery.md)。小错用已有图作为 edit target，锁住其余内容，另存修正版；通过后替换最终页。参考 [有效修图例子](references/local-edit-examples.md)。
6. **打包与验证。** 使用 presentations skill 和 `@oai/artifact-tool`；可运行 [package_images.mjs](scripts/package_images.mjs)，再用 [verify_delivery.py](scripts/verify_delivery.py) 检查页序、图片字节和备注。重新导入/渲染最终 PPTX 并看图。生成 PNG ZIP 与实际提示词记录。交付链接明确标注“图片版”；验证记录放构建目录，用户要求时再提供。

## 模型与资源边界

OpenAI 兼容 API 的参考方式是 bundled `image_gen.py edit` + 风格参考 + `--quality high --size auto --no-augment`。[生成配置说明](references/known-good-profile.md) 保留已验证的参数和尺寸经验；端点、模型和授权由当前任务提供。Windows 可用 [invoke_imagegen.ps1](scripts/invoke_imagegen.ps1)；它只封装 bundled CLI，不实现新 SDK。读取 [供应商说明](references/provider-and-secrets.md) 后使用；新任务指定其他配置时遵循新要求。

Key 只通过进程环境传入，不保存到 skill、提示词、manifest、日志、PPT 或 ZIP。另一供应商须使用自己的协议和已授权凭据；已有授权不能自动扩展到其他端点。同一会话已授权的端点和动作无须再次确认。先通过依赖工具发现运行时，避免写死本机缓存路径。

以当前加载的 `SKILL.md` 所在目录作为 skill 根目录，所有 `assets/`、`references/`、`scripts/` 路径均相对于它解析。技能可以安装在用户级或项目级目录，不假定当前项目存在 `.agents/skills/`。新任务的提示词、PNG 和交付物放当前工作项目 `output/`，临时修图与验证放 `tmp/`；不要将任务产物写进已安装的 skill 目录。

运行依赖：图像生成需要 imagegen 或当前任务指定且已授权的供应商；附带的 PPTX 打包脚本需要 presentations skill、Node.js、`@oai/artifact-tool`、Python 及工作区依赖发现能力，具体配置见 [打包说明](references/packaging.md)。Windows API 包装器另需 PowerShell。依赖缺失时说明缺项，不能把安装 skill 文件当作依赖已经就绪。
