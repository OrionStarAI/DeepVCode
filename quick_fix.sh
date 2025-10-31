#!/bin/bash

# 快速修复脚本 - 解决 npm 安装和构建问题

echo "🔧 开始修复 DeepV Code 构建环境..."
echo ""

# 步骤 1: 修复 npm 缓存权限
echo "📝 步骤 1/4: 修复 npm 缓存权限..."
echo "需要输入你的密码（sudo 权限）："
sudo chown -R $(whoami) ~/.npm
echo "✅ 权限修复完成"
echo ""

# 步骤 2: 清理 npm 缓存
echo "📝 步骤 2/4: 清理 npm 缓存..."
npm cache clean --force
echo "✅ 缓存清理完成"
echo ""

# 步骤 3: 安装依赖
echo "📝 步骤 3/4: 安装项目依赖..."
npm install
if [ $? -eq 0 ]; then
    echo "✅ 依赖安装完成"
else
    echo "❌ 依赖安装失败，请检查错误信息"
    exit 1
fi
echo ""

# 步骤 4: 构建项目
echo "📝 步骤 4/4: 构建项目..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ 项目构建完成"
else
    echo "❌ 项目构建失败，请检查错误信息"
    exit 1
fi
echo ""

echo "🎉 修复完成！现在可以运行 'npm run dev' 测试新功能了"


