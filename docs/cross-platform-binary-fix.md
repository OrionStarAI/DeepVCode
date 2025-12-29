# 跨平台二进制文件权限修复

## 问题描述

在Windows系统上执行 `npm run pack:prod` 时，生成的 `.tgz` 包会丢失Unix系统（macOS/Linux）上二进制文件的执行权限。这是因为：

1. Windows文件系统不支持Unix执行权限概念
2. ZIP/TAR压缩时无法保留Unix执行权限
3. 在macOS/Linux上解压后，ripgrep二进制文件没有执行权限，导致错误：
   ```
   Error: Failed to execute ripgrep: spawn /usr/local/lib/node_modules/deepv-code/bundle/node_modules/@vscode/ripgrep/bin/darwin-x64-rg EACCES
   ```

## 解决方案

### 1. 自动修复（推荐）

我们已经实现了自动修复机制：

#### a. 构建时权限设置
在 `scripts/copy_bundle_assets.js` 中，复制二进制文件时自动设置执行权限（仅Unix系统）：

```javascript
// 确保二进制文件具有执行权限 (Unix系统)
if (process.platform !== 'win32' && (file === 'rg' || file.endsWith('-rg'))) {
  try {
    fs.chmodSync(targetPath, 0o755);
    console.log(`  ✅ 设置执行权限: ${file}`);
  } catch (error) {
    console.warn(`  ⚠️  无法设置执行权限 ${file}: ${error.message}`);
  }
}
```

#### b. 安装后自动修复
添加了 `postinstall` npm 钩子，安装后自动修复权限：

```json
{
  "scripts": {
    "postinstall": "node scripts/fix-binary-permissions.js --all"
  }
}
```

### 2. 手动修复

如果自动修复失败，可以手动执行：

```bash
# 修复已知的ripgrep二进制文件权限
node scripts/fix-binary-permissions.js

# 或者递归修复所有二进制文件权限
node scripts/fix-binary-permissions.js --all

# 指定目录
node scripts/fix-binary-permissions.js --all --dir /path/to/bundle
```

### 3. 直接命令修复

如果脚本不可用，可以直接使用命令行：

```bash
# 进入安装目录
cd /usr/local/lib/node_modules/deepv-code

# 修复所有ripgrep二进制文件权限
find . -name "*rg" -type f ! -name "*.exe" -exec chmod +x {} \;

# 或者针对特定文件
chmod +x bundle/node_modules/@vscode/ripgrep/bin/darwin-x64-rg
chmod +x bundle/node_modules/@vscode/ripgrep/bin/darwin-arm64-rg
chmod +x bundle/node_modules/@vscode/ripgrep/bin/linux-x64-rg
# 等等...
```

## 支持的平台和二进制文件

脚本会自动检测并修复以下二进制文件的权限：

- `rg` (通用ripgrep二进制)
- `darwin-x64-rg` (macOS Intel)
- `darwin-arm64-rg` (macOS Apple Silicon)
- `linux-x64-rg` (Linux x86_64)
- `linux-arm64-rg` (Linux ARM64)
- `linux-arm-rg` (Linux ARM)

## 验证修复

修复后，可以验证权限是否正确：

```bash
# 检查文件权限
ls -la bundle/node_modules/@vscode/ripgrep/bin/

# 输出应该显示类似：
# -rwxr-xr-x  darwin-x64-rg
# -rwxr-xr-x  linux-x64-rg
```

或者直接测试执行：

```bash
# 测试二进制文件是否可执行
./bundle/node_modules/@vscode/ripgrep/bin/darwin-x64-rg --version
```

## 开发建议

### 为未来避免此问题

1. **使用CI/CD**：在Linux环境中进行最终打包
2. **Docker构建**：使用Docker在Linux容器中构建跨平台包
3. **多平台构建**：针对不同平台单独构建

### CI/CD配置示例

```yaml
# .github/workflows/release.yml
name: Release
jobs:
  build-unix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Build and pack
        run: npm run pack:prod
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: deepv-code-unix
          path: "*.tgz"
```

## 故障排除

### 1. 权限修复失败

```bash
# 检查Node.js是否有权限执行chmod
ls -la scripts/fix-binary-permissions.js

# 确保脚本本身可执行
chmod +x scripts/fix-binary-permissions.js
```

### 2. 二进制文件仍然无法执行

```bash
# 检查文件是否存在
ls -la bundle/node_modules/@vscode/ripgrep/bin/

# 手动设置权限
chmod 755 bundle/node_modules/@vscode/ripgrep/bin/*rg

# 检查文件完整性
file bundle/node_modules/@vscode/ripgrep/bin/darwin-x64-rg
```

### 3. 跨平台二进制缺失

确保使用了跨平台构建：

```bash
# 使用跨平台环境变量
DOWNLOAD_ALL_PLATFORMS=true npm run bundle:cross-platform:prod
```

## 总结

这个修复方案通过以下三个层次确保跨平台兼容性：

1. **构建时**：在复制二进制文件时设置正确权限
2. **安装时**：通过postinstall钩子自动修复权限  
3. **手动时**：提供专用脚本进行权限修复

这样可以确保无论在什么环境下打包，在Unix系统上安装后都能正常工作。