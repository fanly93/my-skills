# 质量检查与交付契约

## 图片检查清单

逐页用 `view_image` 检查以下项目：

- PNG 能读取，横向 16:9，边框和标题没有裁切。
- 标题、正文、产品名、中文标点、数字和英文品牌清楚且无错字、漏字、重字。
- 参考图只提供风格；新主题没有残留参考图的 logo、品牌、案例或页码。
- 所有并列项同级；所有箭头方向和人工确认门控与内容一致。
- 共同底座与业务结果的关系正确；没有把支撑线误画成业务流程箭头。
- 右上角为空；没有水印、模型标记、随机小字或模型编造的 UI。
- 多页之间颜色、线条粗细、标题位置、案例名和术语保持一致。

发现问题时：把原图复制到 `tmp/<deck>/before/`，用同一模型做单一目标的局部 edit，输出到 `tmp/<deck>/edits/`；检查通过后再覆盖最终页。不要直接覆盖唯一版本，也不要因一页小错误重生成全部页面。

## PPTX 检查清单

- 使用 `@oai/artifact-tool` 和 presentations skill，不能用 `python-pptx`。
- 页数等于 manifest 的 `slides` 数组，页序只由数组决定。
- 每页只有一张满版 PNG，尺寸 16:9，图片无拉伸裁切。
- 每页 speaker notes 可包含页标题、来源、原稿插入位置、概念示意说明；不能包含密钥。
- 重新导入并渲染最终 PPTX，至少检查联系表和所有有修改的页。
- 原稿补充模式下，计算并记录原稿 hash，打包后重新计算并确认未变化。

## 输出目录建议

```text
output/imagegen/<deck-name>/
  images/NN_<id>.png
  prompts/NN_<id>.txt
  manifest.json
  prompt-set.md
  contact-sheet.jpg
  <deck-name>_图片版.pptx
  <deck-name>.zip

tmp/<deck-name>/
  before/
  edits/
  rendered/
  validation.json
```

ZIP 只放最终 PNG、`使用说明.txt` 和必要的 manifest；排除原始参考图、修图中间件、日志、`.env`、auth 文件和任何密钥。

## 交付说明

明确交付物是“图片版 PPTX”还是“可编辑 PPTX”。整页 PNG 在 PPT 中无法逐项编辑；如果用户要可编辑内容，另行重建原生文本、表格、图形和连接线，并复用本 skill 的视觉合同。
