# 图片型 PPTX 打包与交付校验

本参考用于把图片生成模型输出的逐页 PNG 包装成 16:9 图片型 PPTX。每页只放一张满版 PNG，正文和插图因此保持生成模型的手绘版式；页标识、标题、讲解备注和来源写入演讲者备注。提示词路径留在 manifest 和构建记录，避免把制作过程信息带进对客讲解。该流程不会把图片 OCR 成可编辑文本，也不会修改来源 PPT。

## 环境发现

先调用工作区依赖发现工具 `mcp__codex_app__load_workspace_dependencies`，从返回结果取得 Node.js、Node 模块目录和 Python。从当前可用 skills 列表中读取 `presentations:Presentations` 的 `SKILL.md`，取其所在目录作为 presentations skill 目录。将它们作为环境变量传给脚本：

```powershell
$env:RUNTIME_NODE_MODULES = '<依赖发现结果中的 Node.js node_modules>'
$env:RUNTIME_PYTHON = '<依赖发现结果中的 Python 可执行文件>'
$env:PRESENTATIONS_SKILL_DIR = '<当前 presentations 的 SKILL.md 所在目录>'
```

如果 `@oai/artifact-tool` 不在默认模块搜索路径，可另设 `ARTIFACT_TOOL_PACKAGE` 为包入口文件或包名。脚本不读取 API 密钥，也不需要模型端点。

## Manifest

manifest 是 UTF-8 JSON，所有 `image_file` 和 `prompt_file` 都相对于 manifest 所在目录，不能使用绝对路径或越出该目录。页序只由 `slides` 数组决定：

```json
{
  "title": "培训主题",
  "slide_size": { "width": 1280, "height": 720 },
  "slides": [
    {
      "id": "01",
      "title": "开场页",
      "prompt_file": "prompts/01.txt",
      "image_file": "images/01.png",
      "notes": "讲解提示",
      "sources": ["https://example.com/source"],
      "insert_after_original": null
    }
  ]
}
```

`title`、每页 `id`、`title` 和 `image_file` 必填。默认尺寸是 1280×720；每张 PNG 的比例必须与它一致。页 ID、图片路径和图片内容不能重复，避免生成结果错页或重复页。`prompt_file`、`notes`、`sources` 和 `insert_after_original` 可选。

## 打包

`--manifest` 和可选的 `--workspace-dir` 相对于调用时的当前目录；工作区默认就是当前目录。`--out` 和 `--build-dir` 的相对路径都相对于 manifest 所在目录，可用 `..` 返回项目的其他目录，但解析后的路径必须留在工作区内，绝对路径也遵守同一限制。图片和提示词输入仍只能引用 manifest 目录内部。

输出文件不能已存在，build 目录也必须为空。两者的目录必须分开且不能相互包含，以免把旧 PNG、旧校验记录或旧 PPTX 混入新交付。最终输出可以直接放在 manifest 目录，构建过程则放项目 `tmp/`，无需强制 `deliveries/` 子目录：

```powershell
$taskSkillRoot = '<当前 handdrawn-image-ppt 的 SKILL.md 所在目录>'
node (Join-Path $taskSkillRoot 'scripts/package_images.mjs') `
  --manifest .\output\imagegen\training\manifest.json `
  --out .\training-image.pptx `
  --build-dir ..\..\..\tmp\training-image-build `
  --workspace-dir .
```

脚本使用 `@oai/artifact-tool` 创建 PPTX，调用 presentations skill 的 `finalizePresentation` 做包完整性和版式检查，然后重新导入最终 PPTX 并渲染每一页到 build 目录的 `rendered/`。禁止改用 `python-pptx`。最终 PPTX 的每页只有一个满版 PNG；演讲者备注保留页 ID、标题、说明、来源及原稿插入位置。提示词路径只保留在 manifest 与构建记录。

## 交付校验

打包完成后使用独立的 Python 标准库校验器。它直接读取 PPTX ZIP/XML，不依赖 Pillow 或 PowerPoint。`--pptx` 和 `--report` 的相对路径也相对于 manifest 所在目录：

```powershell
python (Join-Path $taskSkillRoot 'scripts/verify_delivery.py') `
  --manifest .\output\imagegen\training\manifest.json `
  --pptx .\training-image.pptx `
  --report ..\..\..\tmp\training-image-build\delivery-verification.json
```

校验器按 PPTX 的实际幻灯片关系顺序逐页检查尺寸、页数、单一满版 PNG、PNG 字节哈希、备注中的页 ID/标题/说明/来源/插入位置，并拒绝坏 ZIP、坏 PNG、重复图片、缺页、错比例和混入原生形状的 PPTX。PNG 会检查块边界、CRC 和压缩像素流。失败时应修正 manifest 或重新生成图片，使用新的空 build 目录和新的输出文件名。

重新导入渲染在隔离子进程执行。部分 Windows runtime 会在保存全部图片后以 `0xC0000409` 原生清理异常退出；仅当完成回执存在、数量匹配且所有渲染 PNG 完整可读时，脚本允许该已验证情况并在 `package_manifest.json` 记录。其他错误会阻止成功交付。仍需逐页肉眼检查渲染图中的中文、箭头、配色、留白和品牌区域，结构检查不能代替内容与风格复核。

## 风格复用要点

内容可以是培训、产品介绍、架构解释或客户方案，但生成提示词应显式引用同一份风格参考图，并固定画布比例、留白、线条、纸张纹理、手写中文和右上角品牌留白等约束。保持每页一个清晰主题，先生成图片再打包；不要把产品事实、客户名称、内部路径或凭据写进本 skill 的通用脚本和文档。
