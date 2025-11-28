# NanoBanana 图像生成命令

`nanobanana` 命令允许用户直接在 DeepV Code CLI 中通过文本提示词生成图像，并支持使用本地图片作为参考（图生图）。

## 语法

```bash
/nanobanana <ratio> <prompt> [@image_path]
```

## 参数说明

| 参数 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `ratio` | 是 | 图片的宽高比。支持常见的比例格式。 | `16:9`, `1:1`, `4:3`, `9:16` |
| `prompt` | 是 | 用于生成图像的详细文本描述（提示词）。 | `A futuristic city`, `一只在太空中飞行的猫` |
| `@image_path` | 否 | 可选的参考图片路径（图生图）。使用 `@` 触发文件选择。 | `@ref.jpg`, `@images/sketch.png` |

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

### 3. 图生图（参考图片）
使用本地图片作为参考来生成新图片。在输入命令时，键入 `@` 即可触发文件选择器：

```bash
/nanobanana 16:9 A realistic version of this sketch @sketch.png
```

## 交互功能

- **文件补全**：在命令末尾输入 `@` 符号，会自动列出当前目录下的文件，支持模糊搜索。
- **图片上传**：选择本地图片后，CLI 会自动将其上传并作为生成任务的参考图。

## 注意事项

- **提示词语言**：虽然支持多种语言，但通常使用英文提示词（Prompt）能获得更准确的生成结果。
- **参数顺序**：请务必先输入比例（ratio），再输入提示词（prompt）。参考图片通常放在最后。
- **网络连接**：生成图像需要连接到云端服务，请确保网络畅通。
