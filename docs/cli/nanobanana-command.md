# NanoBanana 图像生成命令

`nanobanana` 命令允许用户直接在 DeepV Code CLI 中通过文本提示词生成图像。

## 语法

```bash
/nanobanana <ratio> <prompt>
```

## 参数说明

| 参数 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `ratio` | 是 | 图片的宽高比。支持常见的比例格式。 | `16:9`, `1:1`, `4:3`, `9:16` |
| `prompt` | 是 | 用于生成图像的详细文本描述（提示词）。 | `A futuristic city`, `一只在太空中飞行的猫` |

## 使用示例

### 1. 生成宽屏壁纸
生成一张 16:9 比例的赛博朋克风格城市图片：

```bash
/nanobanana 16:9 A cyberpunk city with neon lights at night, high detail, 8k
```

### 2. 生成方形头像
生成一张 1:1 比例的卡通风格头像：

```bash
/nanobanana 1:1 cute anime girl avatar, pastel colors, flat design
```

### 3. 生成手机壁纸
生成一张 9:16 比例的风景图：

```bash
/nanobanana 9:16 mountains and lake during sunset, realistic style
```

## 注意事项

- **提示词语言**：虽然支持多种语言，但通常使用英文提示词（Prompt）能获得更准确的生成结果。
- **参数顺序**：请务必先输入比例（ratio），再输入提示词（prompt）。
- **网络连接**：生成图像需要连接到云端服务，请确保网络畅通。
