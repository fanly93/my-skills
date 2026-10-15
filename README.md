# My Skills · 个人 Skill 工具箱

保存可按需安装的 Agent Skills。每个 Skill 独立放在 `skills/<skill-name>/`，仓库可以持续增加其他技能；安装时只复制匹配目标的技能目录。

## 让 Agent 根据目标选择并安装

把下面这段话交给支持本地 Skill 的 Agent，并替换最后的目标：

> 请查看我的 Skill 工具箱 https://github.com/fanly93/my-skills ，先读取 README.md 和 skills.json，根据我的目标筛选技能，再阅读候选技能的 SKILL.md。将匹配的技能及其完整资源安装到当前 Agent 支持的本地技能目录，检查依赖并告诉我安装结果。如果没有匹配技能，请直接说明。我的目标是：制作一套米白纸纹、彩铅手绘风格的中文培训 PPT。

Agent 入口：[AGENTS.md](AGENTS.md) · 机器可读索引：[skills.json](skills.json) · [原始 JSON](https://raw.githubusercontent.com/fanly93/my-skills/main/skills.json)

仓库提供技能说明和选择依据；自动选择、联网下载和本地安装由接收请求的 Agent 执行，需要它具备相应工具及文件权限。

## 当前技能

| Skill | 适用目标 | 安装路径 |
| --- | --- | --- |
| [handdrawn-image-ppt](skills/handdrawn-image-ppt/SKILL.md) | 米白纸纹、铅笔线稿和彩铅配色的中文培训、产品介绍、业务方案和补充幻灯片 | `skills/handdrawn-image-ppt` |

### handdrawn-image-ppt 的输出与依赖

- 输出整页 PNG、图片版 PPTX、PNG ZIP 和实际提示词记录。图片版 PPTX 中的文字与图形不能逐项编辑；如需可编辑对象，应结合演示文稿能力重建。
- 包含 3 张风格参考图、提示词模式、内容与视觉检查说明，以及生成包装、PPTX 打包和交付校验脚本。参考图中的业务名称和文字只作历史示例，新任务只复用画风。
- 主要面向具备 `imagegen`、`presentations` 和工作区依赖发现工具的 Codex 环境。图片生成也可使用当前任务明确指定且已授权的供应商。
- 附带的 PPTX 打包脚本需要 Node.js、`@oai/artifact-tool`、Python，以及 `presentations` Skill 中的打包校验工具。Windows API 包装脚本另需 PowerShell；仅查看提示词和风格参考无需这些运行依赖。
- 模型、端点和凭据由当前环境配置。仓库不包含 API key，也不携带原项目的凭据授权。

## 在 Codex 中安装单个 Skill

若当前环境提供 `skill-installer`，让 Agent 找到该技能随附的安装脚本并执行：

```text
python <skill-installer目录>/scripts/install-skill-from-github.py --repo fanly93/my-skills --path skills/handdrawn-image-ppt --ref main
```

默认目标是 `$CODEX_HOME/skills/handdrawn-image-ppt`；未设置 `CODEX_HOME` 时为 `~/.codex/skills/handdrawn-image-ppt`。也可使用该脚本的 `--dest` 指定当前 Agent 支持的技能目录。具体脚本和 Python 路径应从当前环境发现。

无专用安装器时，可将仓库克隆到临时目录，只把选中的完整 Skill 文件夹复制到目标技能目录。保留 `agents/`、`assets/`、`references/`、`scripts/` 及其相对路径；不要只下载 `SKILL.md`。目标目录已存在时先检查差异，保留本地修改。

安装完成后，按当前 Agent 的技能发现机制加载；Codex 中可在下一轮请求使用 `$handdrawn-image-ppt`。安装技能不会自动配置图片服务或安装运行依赖。

## 仓库结构

```text
my-skills/
├── README.md
├── AGENTS.md
├── skills.json
└── skills/
    └── handdrawn-image-ppt/
        ├── SKILL.md
        ├── agents/
        ├── assets/
        ├── references/
        └── scripts/
```

## 后续新增技能

1. 创建 `skills/<skill-name>/SKILL.md`，在 YAML 头部填写与目录同名的 `name`，并用 `description` 描述适用目标和触发情境。
2. 把运行所需资源放进该 Skill 自己的目录，使用相对路径；运行时、输出目录和服务配置从实际环境获取。
3. 在 `skills.json` 增加条目，写清匹配目标、不适用范围、输出和依赖，并同步上方技能表。
4. 验证头部、资源链接、脚本和独立安装，再提交推送。只提交可复用资源，排除凭据、生成交付物和临时文件。

根目录不放 `SKILL.md`：这个仓库是技能集合，每个 `skills/<skill-name>/` 才是独立安装单位。
