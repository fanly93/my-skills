# 局部修图：三类经过验证的方法

输入图片是**已有的错误页，作为 edit target**。输出另存 `tmp/<任务>/edits/`，不要覆盖唯一原图；目视通过才替换最终页。每个请求只解决一个语义目标，其他文字、图形、配色、尺寸、边框与纸纹保持。

## 1. 中文标签错误

```text
Use case: text-localization
Input image 1: the already generated slide, exact edit target.
Correct only the label on the rightmost book in the left input section.
Replace its text with exactly “质量记录”. Keep the four Chinese characters correct.
Keep all other pixels, titles, labels, people, arrows, frame, palette, texture and dimensions unchanged.
Do not add logos, page numbers or any extra labels.
```

描述位置比只写“改错别字”可靠。竖排标签应写明字符顺序，避免重复编号或错位。

## 2. 并列资产误画成串行

```text
Use case: precise-object-edit
Input image 1: the generated comparison page, exact edit target.
Fix only the lower delivery diagram. Keep the entire upper table, title, subtitle and footnotes exactly.
Place the four existing asset icons side by side within one wide pale-blue pencil-outlined container.
These are parallel assets, not processing steps. Remove all arrows between them.
Use one common delivery arrow from the asset package to the user installation entry.
Put the shared governance foundation in a pale-green band UNDER both the package and user entry,
with separate dotted supporting lines. Do not put the foundation after the user in a serial flow.
Retain the exact four existing labels, palette, paper grain and handwriting. No logos.
```

一次只改“交付图的关系”，保留上方事实比较表，能减少修图后新错字。

## 3. 共同底座依赖线接错

```text
Use case: precise-object-edit
Input image 1: the generated architecture page, exact edit target.
Change only the two dotted dependency lines in the left architecture column.
One line must connect the common foundation to the top-left product.
The other must connect the same foundation to the top-right product.
Route both along the inner margins, avoiding all text, illustrations and central execution boxes.
Keep the independent Runtime outside the foundation. Preserve solid execution arrows.
Keep all words, other architecture columns, colors, borders and footnotes exactly. No logos.
```

用明确的起点、终点、走线区域和保留项替代“优化箭头”。修后仍需逐页确认，不假定模型只改变了目标区域。
