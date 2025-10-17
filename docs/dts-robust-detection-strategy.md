# DTS文件鲁棒检测策略（修正版）

## 问题重新分析

根据实际调研，Linux内核设备树文件的真实情况：

1. **`.dtsi`文件**: 通常**不包含**`/dts-v1/`头，是包含文件
2. **`.dts`文件**: 可能包含大量版权信息，`/dts-v1/`可能在很后面
3. **版权头**: 可能占用大量字节（500-2000字节不等）
4. **SPDX标识**: 现代文件通常以`// SPDX-License-Identifier:`开头

## 新的检测特征

### Linux设备树文件的真实特征

1. **文本特征**:
   - 纯文本格式，UTF-8编码
   - 包含C风格注释 `/* */` 和 `//`
   - SPDX许可证标识符

2. **语法特征**:
   - 包含设备树特有的语法结构
   - `compatible = "...";` 属性
   - `#address-cells`、`#size-cells` 等DT特有属性
   - `#include <dt-bindings/...>` 或 `#include "...dtsi"`
   - 节点结构 `nodename { ... };`
   - 标签引用 `&label`

3. **版本特征**:
   - `.dts`文件可能包含`/dts-v1/;`
   - `.dtsi`文件通常不包含版本头

### DTS音频文件特征

1. **二进制格式**，包含音频数据流
2. **魔数/头部**：通常有特定的二进制标识
3. **大量非文本字符**

## 鲁棒检测策略

### 策略1：多特征综合检测（推荐）

```typescript
/**
 * 检测.dts/.dtsi文件是否为Linux设备树文件
 * 使用多个特征进行综合判断
 */
async function isLinuxDeviceTreeFile(filePath: string): Promise<boolean> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');

    // 读取更多内容以处理大的版权头（最多4KB）
    const buffer = Buffer.alloc(4096);
    const result = await fileHandle.read(buffer, 0, buffer.length, 0);

    if (result.bytesRead === 0) return false;

    // 首先检查是否为有效的文本文件
    if (!isValidTextContent(buffer, result.bytesRead)) {
      return false;
    }

    const content = buffer.slice(0, result.bytesRead).toString('utf-8');

    // 计算设备树特征得分
    let score = 0;

    // 1. SPDX许可证标识符 (+2分)
    if (/\/\/\s*SPDX-License-Identifier:/i.test(content)) {
      score += 2;
    }

    // 2. 设备树版本头 (+3分，仅对.dts文件)
    if (path.extname(filePath).toLowerCase() === '.dts' &&
        /\/dts-v1\/\s*;/.test(content)) {
      score += 3;
    }

    // 3. 设备树特有的包含语句 (+2分)
    if (/#include\s*[<"][^>"]*(dt-bindings|\.dtsi)[>"]/.test(content)) {
      score += 2;
    }

    // 4. compatible属性 (+2分)
    if (/compatible\s*=\s*"[^"]+"/i.test(content)) {
      score += 2;
    }

    // 5. 设备树特有的属性 (+1分)
    if (/#(address-cells|size-cells|interrupt-cells|gpio-cells)\s*=/.test(content)) {
      score += 1;
    }

    // 6. 节点结构 (+1分)
    if (/\w+[@:]?\w*\s*\{[\s\S]*\}/.test(content)) {
      score += 1;
    }

    // 7. 标签引用 (+1分)
    if (/&\w+/.test(content)) {
      score += 1;
    }

    // 8. Linux内核版权信息 (+1分)
    if (/Copyright.*Linux Foundation|GPL|GNU General Public License/i.test(content)) {
      score += 1;
    }

    // 总分>=4分认为是设备树文件
    return score >= 4;

  } catch (error) {
    return false;
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        // 忽略关闭错误
      }
    }
  }
}

/**
 * 检查内容是否为有效的文本（排除二进制音频文件）
 */
function isValidTextContent(buffer: Buffer, bytesRead: number): boolean {
  let nonPrintableCount = 0;
  let nullByteCount = 0;

  for (let i = 0; i < bytesRead; i++) {
    const byte = buffer[i];

    // Null字节强烈表明是二进制文件
    if (byte === 0) {
      nullByteCount++;
      if (nullByteCount > 2) return false; // 允许少量null字节
    }

    // 统计非打印字符
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableCount++;
    }
  }

  // 如果非打印字符超过20%，可能是二进制文件
  return nonPrintableCount / bytesRead <= 0.2;
}
```

### 策略2：简化版本（性能优先）

如果担心性能，可以使用更简单的检测：

```typescript
async function isLinuxDeviceTreeFile(filePath: string): Promise<boolean> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');

    // 读取前2KB
    const buffer = Buffer.alloc(2048);
    const result = await fileHandle.read(buffer, 0, buffer.length, 0);

    if (result.bytesRead === 0) return false;

    // 快速二进制检查
    if (buffer.slice(0, result.bytesRead).includes(0)) {
      return false; // 包含null字节，可能是二进制文件
    }

    const content = buffer.slice(0, result.bytesRead).toString('utf-8');

    // 简单特征检查：只要包含任一设备树特征
    return /\/\/\s*SPDX-License-Identifier:|\/dts-v1\/|#include.*dt-bindings|compatible\s*=|#address-cells|&\w+/.test(content);

  } catch (error) {
    return false;
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        // 忽略关闭错误
      }
    }
  }
}
```

## 修改的detectFileType函数

```typescript
export async function detectFileType(
  filePath: string,
): Promise<'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'svg'> {
  const ext = path.extname(filePath).toLowerCase();

  // 现有特殊处理
  if (ext === '.ts') {
    return 'text';
  }

  if (ext === '.svg') {
    return 'svg';
  }

  // DTS/DTSI文件智能检测
  if (ext === '.dts' || ext === '.dtsi') {
    if (await isLinuxDeviceTreeFile(filePath)) {
      return 'text';
    }
    // 如果不是设备树文件，继续按MIME类型处理
  }

  // 继续原有的MIME类型检测逻辑...
  const lookedUpMimeType = mime.lookup(filePath);
  // ...
}
```

## 测试用例

```typescript
describe('DTS文件鲁棒检测', () => {
  it('应该识别带大量版权信息的DTS文件', async () => {
    const dtsContent = `// SPDX-License-Identifier: GPL-2.0 OR MIT
/*
 * Copyright (C) 2018-2023 The Linux Foundation. All rights reserved.
 * [大量版权信息...]
 */

/dts-v1/;
#include <dt-bindings/gpio/gpio.h>
#include "msm8916-qrd.dtsi"

/ {
    model = "Qualcomm MSM8916 QRD";
    compatible = "qcom,msm8916-qrd", "qcom,msm8916";

    soc {
        #address-cells = <1>;
        #size-cells = <1>;
    };
};`;

    const testFile = path.join(tempRootDir, 'complex.dts');
    await fs.writeFile(testFile, dtsContent);

    expect(await detectFileType(testFile)).toBe('text');
  });

  it('应该识别不含版本头的DTSI文件', async () => {
    const dtsiContent = `// SPDX-License-Identifier: GPL-2.0
/* Common SoC definitions */

&cpu0 {
    compatible = "arm,cortex-a55";
    #address-cells = <1>;
    clock-frequency = <800000000>;
};

&gpio {
    gpio-controller;
    #gpio-cells = <2>;
};`;

    const testFile = path.join(tempRootDir, 'soc.dtsi');
    await fs.writeFile(testFile, dtsiContent);

    expect(await detectFileType(testFile)).toBe('text');
  });

  it('应该正确识别二进制音频DTS文件', async () => {
    // 模拟二进制DTS音频文件
    const binaryContent = Buffer.from([
      0x7F, 0xFE, 0x80, 0x01, // DTS sync word
      0x00, 0x00, 0x00, 0x00,
      // ... 更多二进制音频数据
    ]);

    const testFile = path.join(tempRootDir, 'audio.dts');
    await fs.writeFile(testFile, binaryContent);

    expect(await detectFileType(testFile)).toBe('audio');
  });
});
```

## 优势

1. **更准确**: 基于多个特征综合判断，不依赖单一标识
2. **更鲁棒**: 处理大版权头、处理dtsi文件
3. **性能可控**: 提供简化版本选择
4. **向后兼容**: 检测失败时保持原有行为

## 建议

推荐使用**策略1（多特征检测）**，因为它能处理更多边界情况，虽然稍微复杂但更准确。