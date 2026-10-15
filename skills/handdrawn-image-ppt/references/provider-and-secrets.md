# 图片供应商、端点与凭据处理

## 选择路径

1. 没有指定模型、端点或 API 时，优先使用 imagegen skill 的内置图像生成能力。
2. 用户明确指定 OpenAI 兼容端点、模型或 CLI/API 时，使用 bundled `image_gen.py`。不要私自替换用户指定模型，也不要把失败静默降级成别的模型。
3. 用户指定其他图片供应商时，先查该供应商官方图像输入、尺寸和鉴权协议。OpenAI CLI 的 `--image`、`--quality`、`--size` 参数不能直接套到其他 API。

## OpenAI 兼容端点的成功模式

使用本 skill 随附的 [invoke_imagegen.ps1](../scripts/invoke_imagegen.ps1) 包装 bundled `image_gen.py`，而不是重新写 SDK 调用程序。先调用 `load_workspace_dependencies` 获取当前 Python 路径；不要沿用上一台电脑的绝对路径。`ImagegenCli` 默认尝试当前 `CODEX_HOME` 或用户配置目录下的 bundled CLI；以当前可用 imagegen skill 的实际位置为准，位置不同时显式传入 `ImagegenCli`。以下为调用模式，路径、模型和端点均按本次任务填写；`taskSkillRoot` 取当前加载的 `SKILL.md` 所在目录：

```powershell
$taskSkillRoot = '<当前 handdrawn-image-ppt 的 SKILL.md 所在目录>'
$taskGeneration = @{
    PythonExecutable = '<load_workspace_dependencies 返回的 Python 可执行文件>'
    PromptFile = 'output/imagegen/本次演示/prompts/01_总览.txt'
    ReferenceImages = @((Join-Path $taskSkillRoot 'assets/style-reference.png'))
    Output = 'output/imagegen/本次演示/01_总览_v1.png'
    Model = '<本次用户指定的图片模型>'
    BaseUrl = '<本次用户授权的 OpenAI 兼容端点>'
    # DependencyPath = '<已安装 openai 的依赖目录>' # 仅需要时传入
}

# 只核对路径与非敏感命令：不读取 auth.json，不改变环境，不调用 API。
& (Join-Path $taskSkillRoot 'scripts/invoke_imagegen.ps1') @taskGeneration -DryRun

# 当前进程已配置并授权该供应商的 OPENAI_API_KEY 后，执行实际生成。
& (Join-Path $taskSkillRoot 'scripts/invoke_imagegen.ps1') @taskGeneration
```

用户已经明确授权该端点复用当前 Codex API key 时，实际调用可加 `-UseCodexApiKey`；同一会话已有的相同端点授权仍有效，不要重复询问。此开关不会覆盖已配置的 `OPENAI_API_KEY`；只有当前环境没有 key 时，才读取当前 Codex 配置的 `auth.json` 中 `OPENAI_API_KEY`。OAuth 登录信息不适用。授权一个第三方端点不代表授权其他端点复用凭据；更换供应商须依据新供应商授权或为其预配置的环境变量。

包装器始终使用 `edit --quality high --size auto --output-format png --no-augment`；参考图必填。这里的 `edit` 是本次 bundled CLI 通过参考图输入进行风格约束的成功模式，提示词应明确“参考图只用于风格，当前页内容按新文案生成”，并标注其他主题图的角色。内置图像工具的纯风格参考仍按 imagegen skill 的生成语义操作。

包装器通过参数数组调用外部程序，key 只在进程环境传递，完成或失败后均恢复其改变的环境变量。`BaseUrl` 不能含用户名、密码、查询参数或片段，以免命令或日志带出秘密。输入文件缺失、输出已存在时立即拒绝；每次重做指定 `_v2` 等新路径，不自动覆盖、不自动换模型、不自动重试。

真实调用前确认：参考图角色写在提示词；每页输出路径唯一；最终目录不混入临时修图；模型返回的 PNG 可读取。该包装器不检查成图文案与版式质量，后续仍要逐页视觉验收。

## 凭据红线

- 优先使用当前进程已为本次供应商配置的 `OPENAI_API_KEY`；读取 Codex 配置并向第三方发送该 key 必须有本次供应商对应的明确授权。
- 不让用户把完整 key 粘到聊天中。
- 不把 key 写入脚本、提示词、manifest、文件名、PPT speaker notes、ZIP、错误日志或截图。
- 命令输出只允许显示“key 已配置”或请求状态，不输出变量值、请求头、完整 URL 中的秘密参数。
- 只把非敏感的 provider、model、端点名称、尺寸、状态和请求 ID 写进 manifest；需要保密的端点参数脱敏。
- 用户没有授权外部写入、发布、发送消息或部署时，停在本地生成与验证。

## 其他供应商适配器

适配器至少接受：`provider`, `model`, `prompt_file`, `reference_images`, `output_path`；返回 `status`, `request_id`, `output_path`, `error_class`。将供应商专属字段限制在适配器里，主流程只处理成功/失败、PNG 校验和重试。重试只针对明确可重试的网络/限流错误；提示词错误或内容不合格应修提示词或单页重做。
