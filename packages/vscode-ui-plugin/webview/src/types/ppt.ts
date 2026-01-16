/**
 * PPT Generator Types
 * PPT生成器类型定义
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

/**
 * PPT风格类型
 */
export type PPTStyle = 'auto' | 'business' | 'flat' | 'travel' | 'advertising' | 'anime' | 'custom';

/**
 * PPT色系类型
 */
export type PPTColorScheme = 'auto' | 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'dark' | 'light' | 'colorful' | 'custom';

/**
 * 风格配置
 */
export interface PPTStyleConfig {
  value: PPTStyle;
  labelKey: string;
  icon: string;
  prompt: string;
}

/**
 * 色系配置
 */
export interface PPTColorSchemeConfig {
  value: PPTColorScheme;
  labelKey: string;
  colors: string[];  // HEX颜色预览（auto和custom为空）
  icon?: string;     // auto和custom用图标
  prompt: string;
}

/**
 * PPT风格选项列表
 */
export const PPT_STYLES: PPTStyleConfig[] = [
  {
    value: 'auto',
    labelKey: 'pptGenerator.style.auto',
    icon: '',
    prompt: '根据PPT主题和内容自动选择最合适的演示风格，分析主题内容后选择恰当的视觉元素、布局方式和设计美学。'
  },
  {
    value: 'business',
    labelKey: 'pptGenerator.style.business',
    icon: '',
    prompt: `PPT设计风格（商务）：
- 布局：整洁的网格布局，结构化内容层次，信息清晰易读
- 视觉：专业企业美学，数据可视化图表，简洁图标
- 字体：正式的无衬线字体，标题醒目，正文易读
- 装饰：极简装饰，避免花哨元素，适合会议室演示
整体风格：专业、稳重、可信赖，适合商业汇报和正式场合。`
  },
  {
    value: 'flat',
    labelKey: 'pptGenerator.style.flat',
    icon: '',
    prompt: `PPT设计风格（扁平插画）：
- 布局：现代扁平化设计，大面积色块分区
- 视觉：几何图形、矢量插画、简化图标、2D人物插画
- 特点：无阴影的干净边缘，大胆的纯色填充
- 装饰：简约线条装饰，流行的设计趋势
整体风格：现代、时尚、年轻化，适合创意展示和产品介绍。`
  },
  {
    value: 'travel',
    labelKey: 'pptGenerator.style.travel',
    icon: '',
    prompt: `PPT设计风格（旅游）：
- 布局：图文并茂，大图背景配文字叠加
- 视觉：风景摄影背景、地标建筑、日落暖色调
- 元素：护照、地图、指南针、飞机等旅行元素装饰
- 氛围：探索发现、冒险精神、度假心情
整体风格：温暖、向往、自由，适合旅游分享和目的地介绍。`
  },
  {
    value: 'advertising',
    labelKey: 'pptGenerator.style.advertising',
    icon: '',
    prompt: `PPT设计风格（广告）：
- 布局：视觉冲击力强，大标题大图片
- 视觉：高对比度色彩、醒目的视觉焦点、促销横幅
- 字体：冲击力强的大字体，行动号召按钮突出
- 特点：吸引眼球、促进转化、销售导向
整体风格：大胆、醒目、有感染力，适合营销推广和产品发布。`
  },
  {
    value: 'anime',
    labelKey: 'pptGenerator.style.anime',
    icon: '',
    prompt: `PPT设计风格（动漫）：
- 布局：活泼动感，打破常规网格
- 视觉：可爱Q版人物、高饱和度色彩、闪光特效
- 元素：对话气泡、漫画分镜、表情包风格
- 氛围：卡哇伊美学、二次元文化、活力四射
整体风格：可爱、活泼、有趣，适合年轻受众和娱乐内容。`
  },
  {
    value: 'custom',
    labelKey: 'pptGenerator.style.custom',
    icon: '',
    prompt: ''
  }
];

/**
 * PPT色系选项列表
 * 每个色系包含：主色、辅色、强调色（对比色）、背景色、文字色
 */
export const PPT_COLOR_SCHEMES: PPTColorSchemeConfig[] = [
  {
    value: 'auto',
    labelKey: 'pptGenerator.colorScheme.auto',
    colors: ['#FF6B6B', '#FFA94D', '#FFE066', '#69DB7C', '#4DABF7', '#9775FA', '#F06595'],
    prompt: '根据PPT主题和内容自动选择最合适的配色方案，确保颜色搭配和谐统一，主色、辅色、强调色、背景色、文字色层次分明。'
  },
  {
    value: 'blue',
    labelKey: 'pptGenerator.colorScheme.blue',
    colors: ['#1565C0', '#42A5F5', '#FF6B35', '#F5F9FF', '#1A365D'],
    prompt: `PPT配色方案（蓝色系）：
- 主色 #1565C0（深蓝色）：用于标题、重要元素、图表主色
- 辅色 #42A5F5（天蓝色）：用于副标题、次要图表、装饰线条
- 强调色 #FF6B35（橙红色）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #F5F9FF（淡蓝白色）：用于幻灯片底色，保证舒适阅读
- 文字色 #1A365D（深蓝灰色）：用于正文内容，与背景形成良好对比
整体风格：专业稳重的蓝色主调，橙色点缀增加活力，淡蓝背景清新专业。`
  },
  {
    value: 'green',
    labelKey: 'pptGenerator.colorScheme.green',
    colors: ['#2E7D32', '#81C784', '#FFC107', '#F1F8E9', '#1B4332'],
    prompt: `PPT配色方案（绿色系）：
- 主色 #2E7D32（森林绿）：用于标题、重要元素、图表主色
- 辅色 #81C784（浅绿色）：用于副标题、次要图表、装饰线条
- 强调色 #FFC107（金黄色）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #F1F8E9（淡绿白色）：用于幻灯片底色，保证舒适阅读
- 文字色 #1B4332（深绿色）：用于正文内容，与背景形成良好对比
整体风格：自然清新的绿色主调，金色点缀增加温暖活力，淡绿背景生机盎然。`
  },
  {
    value: 'red',
    labelKey: 'pptGenerator.colorScheme.red',
    colors: ['#C62828', '#EF5350', '#FFD54F', '#FFF5F5', '#7F1D1D'],
    prompt: `PPT配色方案（红色系）：
- 主色 #C62828（深红色）：用于标题、重要元素、图表主色
- 辅色 #EF5350（亮红色）：用于副标题、次要图表、装饰线条
- 强调色 #FFD54F（金黄色）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #FFF5F5（淡粉白色）：用于幻灯片底色，保证舒适阅读
- 文字色 #7F1D1D（暗红色）：用于正文内容，与背景形成良好对比
整体风格：热情大胆的红色主调，金色点缀增加高级感，淡粉背景柔和不刺眼。`
  },
  {
    value: 'purple',
    labelKey: 'pptGenerator.colorScheme.purple',
    colors: ['#6A1B9A', '#BA68C8', '#26C6DA', '#FAF5FF', '#4A1259'],
    prompt: `PPT配色方案（紫色系）：
- 主色 #6A1B9A（深紫色）：用于标题、重要元素、图表主色
- 辅色 #BA68C8（浅紫色）：用于副标题、次要图表、装饰线条
- 强调色 #26C6DA（青色）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #FAF5FF（淡紫白色）：用于幻灯片底色，保证舒适阅读
- 文字色 #4A1259（暗紫色）：用于正文内容，与背景形成良好对比
整体风格：创意高贵的紫色主调，青色点缀增加现代科技感，淡紫背景优雅神秘。`
  },
  {
    value: 'orange',
    labelKey: 'pptGenerator.colorScheme.orange',
    colors: ['#E65100', '#FFB74D', '#00ACC1', '#FFF8E1', '#7C2D12'],
    prompt: `PPT配色方案（橙色系）：
- 主色 #E65100（深橙色）：用于标题、重要元素、图表主色
- 辅色 #FFB74D（浅橙色）：用于副标题、次要图表、装饰线条
- 强调色 #00ACC1（青蓝色）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #FFF8E1（淡橙白色）：用于幻灯片底色，保证舒适阅读
- 文字色 #7C2D12（棕色）：用于正文内容，与背景形成良好对比
整体风格：温暖活力的橙色主调，青蓝点缀增加清爽感，淡橙背景温馨明亮。`
  },
  {
    value: 'dark',
    labelKey: 'pptGenerator.colorScheme.dark',
    colors: ['#1E1E1E', '#3D3D3D', '#00D9FF', '#121212', '#E0E0E0'],
    prompt: `PPT配色方案（深色系）：
- 主色 #1E1E1E（炭黑色）：用于卡片、容器、图表主色
- 辅色 #3D3D3D（深灰色）：用于分隔线、次要区块、装饰元素
- 强调色 #00D9FF（霓虹蓝）：用于标题、按钮、高亮文字、重点标注、图标
- 背景色 #121212（纯黑色）：用于幻灯片底色，高端科技感
- 文字色 #E0E0E0（浅灰白色）：用于正文内容，与深色背景形成高对比
整体风格：高端科技的深色主调，霓虹蓝点缀增加酷炫感，纯黑背景现代高级。`
  },
  {
    value: 'light',
    labelKey: 'pptGenerator.colorScheme.light',
    colors: ['#37474F', '#78909C', '#FF7043', '#FFFFFF', '#263238'],
    prompt: `PPT配色方案（浅色系）：
- 主色 #37474F（蓝灰色）：用于标题、重要元素、图表主色
- 辅色 #78909C（中灰色）：用于副标题、次要图表、装饰线条
- 强调色 #FF7043（珊瑚橙）：用于按钮、高亮文字、重点标注、图标点缀
- 背景色 #FFFFFF（纯白色）：用于幻灯片底色，简约干净
- 文字色 #263238（深灰色）：用于正文内容，与白色背景形成良好对比
整体风格：简约干净的浅色主调，珊瑚橙点缀增加温度，纯白背景清爽明亮。`
  },
  {
    value: 'colorful',
    labelKey: 'pptGenerator.colorScheme.colorful',
    colors: ['#6366F1', '#EC4899', '#10B981', '#FFFBEB', '#1F2937'],
    prompt: `PPT配色方案（多彩系）：
- 主色 #6366F1（靛蓝色）：用于标题、重要元素
- 辅色 #EC4899（玫红色）：用于副标题、装饰元素
- 强调色 #10B981（翡翠绿）：用于按钮、高亮、图标点缀
- 背景色 #FFFBEB（暖白色）：用于幻灯片底色，温暖舒适
- 文字色 #1F2937（深灰色）：用于正文内容
可额外使用 #F59E0B（琥珀黄）、#8B5CF6（紫罗兰）等多彩色点缀。
整体风格：活泼年轻的多彩配色，色彩丰富充满创意，暖白背景柔和统一。`
  },
  {
    value: 'custom',
    labelKey: 'pptGenerator.colorScheme.custom',
    colors: [],
    prompt: ''
  }
];

/**
 * 获取风格提示词
 */
export function getStylePrompt(style: PPTStyle, customStyleText: string): string {
  if (style === 'custom' && customStyleText.trim()) {
    return `PPT设计风格（自定义）：${customStyleText.trim()}。请按照此风格描述设计整个PPT的视觉效果。`;
  }
  return PPT_STYLES.find(s => s.value === style)?.prompt || '';
}

/**
 * 获取色系提示词
 */
export function getColorSchemePrompt(colorScheme: PPTColorScheme, customColorText: string): string {
  if (colorScheme === 'custom' && customColorText.trim()) {
    return `PPT配色方案（自定义）：${customColorText.trim()}。请根据此描述生成和谐统一的配色方案，包含主色、辅色、强调色、背景色、文字色，并在整个PPT中保持一致。`;
  }
  return PPT_COLOR_SCHEMES.find(c => c.value === colorScheme)?.prompt || '';
}

/**
 * 组合风格和色系提示词
 */
export function getCombinedStylePrompt(
  style: PPTStyle,
  customStyleText: string,
  colorScheme: PPTColorScheme,
  customColorText: string
): string {
  const stylePrompt = getStylePrompt(style, customStyleText);
  const colorPrompt = getColorSchemePrompt(colorScheme, customColorText);

  if (stylePrompt && colorPrompt) {
    return `${stylePrompt}\n\n${colorPrompt}`;
  }
  return stylePrompt || colorPrompt || '';
}