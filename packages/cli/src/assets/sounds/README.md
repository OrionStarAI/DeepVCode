# 音频通知配置

DeepV Code 支持在关键交互点播放提示音，提升用户体验。

## 音频文件

请将以下 WAV 格式音频文件放在此目录：

- `response-complete.wav` - Agent响应完成时播放
- `confirmation-required.wav` - 需要用户确认工具执行时播放  
- `selection-made.wav` - 用户做出选择后播放

## 配置选项

在你的 `~/.deepv/settings.json` 文件中添加以下配置：

```json
{
  "audioNotifications": {
    "enabled": true,
    "responseComplete": true,
    "confirmationRequired": true,
    "selectionMade": true
  }
}
```

### 配置说明

- `enabled`: 总开关，设为 `false` 可完全禁用音频通知
- `responseComplete`: Agent响应完成提示音
- `confirmationRequired`: 工具执行确认提示音
- `selectionMade`: 选择完成提示音

## 测试音频

运行以下命令测试音频功能：

```bash
dvcode --test-audio
```

## 跨平台支持

音频通知支持以下平台：

### Windows
- 优先使用 PowerShell 播放自定义 WAV 文件
- 备选使用系统提示音（不同频率区分类型）

### macOS  
- 优先使用 `afplay` 播放自定义 WAV 文件
- 备选使用系统音效（Glass.aiff, Ping.aiff, Pop.aiff）

### Linux
- 优先使用 `paplay` 或 `aplay` 播放自定义 WAV 文件
- 备选使用 `speaker-test` 生成不同频率提示音

## 故障排除

如果音频不工作：

1. 检查系统音量设置
2. 确保音频文件格式正确（WAV 格式）
3. 运行 `dvcode --test-audio` 进行诊断
4. 查看控制台调试信息
5. 临时禁用音频通知继续使用

## 音频文件建议

- 文件大小：建议小于 100KB
- 时长：建议 0.2-1 秒
- 格式：WAV（16-bit PCM）
- 音量：适中，避免过于刺耳
