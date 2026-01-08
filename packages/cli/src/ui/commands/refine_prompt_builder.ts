import fs from 'fs';

export interface RefinePromptOptions {
  tone: string;
  level: string;
  lang: string;
  max?: number;
  keepCode: boolean;
  keepFormat: boolean;
  noEmoji: boolean;
  glossary?: string;
  rules: string[];
}

/**
 * 构建润色提示词 (研发友好版)
 */
export function buildEngineeringRefinePrompt(text: string, options: RefinePromptOptions): string {
  const parts: string[] = [];

  // 1. Role definition
  parts.push('# 角色');
  parts.push('');
  parts.push('你是高级提示词工程师与技术架构师. 你的任务是将用户模糊、简短的指令重写并增强为清晰、具体、无歧义的高质量提示词, 使其更易于被 AI 执行.');
  parts.push('');

  // 2. Hard constraints
  parts.push('# 硬性约束 (必须遵守)');
  parts.push('');

  if (options.keepCode) {
    parts.push('**保护既有代码**: 如果输入中包含代码块、反引号内的技术术语、标志位(如 --flag), 必须原样保留或仅在逻辑需要时优化叙述, 绝对不破坏代码本身.');
    parts.push('');
  }

  parts.push('**技术准确性**: 保持术语大小写正确 (React, TypeScript, Node.js 等).');
  parts.push('');

  if (options.noEmoji) {
    parts.push('**禁止 Emoji**: 输出中不使用任何表情符号.');
    parts.push('');
  }

  // Language settings
  if (options.lang === 'auto') {
    parts.push('**语言**: 自动检测输入语言并使用相同语言输出.');
  } else {
    parts.push('**语言**: 使用 ' + options.lang + ' 输出.');
  }
  parts.push('');

  // 3. Tone and Level mapping
  parts.push('# 增强策略 (核心)');
  parts.push('');

  // Level instructions
  const levelMap: Record<string, string> = {
    light: '**强度 - 轻微优化**\n- 只修正拼写、语法和基本语序\n- 略微提升表述的专业度\n- 保持输出长度与输入相当',
    medium: '**强度 - 深度增强**\n- **合理推断**: 识别用户的核心诉求, 补充缺失的 5W1H (What, Why, How 等)\n- **结构化输出**: 使用列表或段落清晰地组织功能点和技术要求\n- **技术栈补充**: 根据上下文合理建议相关技术栈 (如 Web 3D 建议 Three.js)',
    deep: '**强度 - 完整方案**\n- **架构级拆解**: 将原始意图转化为一份包含"功能需求"、"技术要求"、"实现细节"的完整规格说明书\n- **主动延展**: 补充输入中未提及但逻辑上必需的细节 (如国际化、响应式、性能约束、验证标准)\n- **交互式确认**: 在结尾询问用户是否符合预期, 或是否有更多细节需要补充',
  };
  parts.push(levelMap[options.level] || levelMap.medium);
  parts.push('');

  // 4. Style goals
  parts.push('# 风格目标');
  parts.push('');
  parts.push('- **清晰**: 一句一意, 优先主动语态, 技术名词准确.');
  parts.push('- **具体**: 避免使用 "相关的"、"适当的"、"一些" 等模糊词汇, 明确具体对象、格式、标准.');
  parts.push('- **可执行**: 润色后的结果应是一个完整、可直接发给 AI 执行的指令.');
  parts.push('');

  // 5. Length strategy
  if (options.max) {
    parts.push('# 长度限制');
    parts.push('');
    parts.push('最大输出长度: ' + options.max + ' 字符.');
    parts.push('');
  }

  // 6. Glossary
  if (options.glossary) {
    try {
      const glossaryContent = fs.readFileSync(options.glossary, 'utf-8');
      const glossary = JSON.parse(glossaryContent);
      parts.push('# 术语表 (严格遵守)');
      parts.push('');
      parts.push('以下术语必须按照指定方式统一 (区分大小写):');
      parts.push('');
      for (const [term, replacement] of Object.entries(glossary)) {
        parts.push('- ' + term + ' -> ' + replacement);
      }
      parts.push('');
    } catch (error) {
      // Skip if glossary fails to load
    }
  }

  // 7. Custom rules
  if (options.rules.length > 0) {
    parts.push('# 自定义规则');
    parts.push('');
    parts.push('除上述约束外, 还需遵守以下规则:');
    parts.push('');
    options.rules.forEach((rule, index) => {
      parts.push((index + 1) + '. ' + rule);
    });
    parts.push('');
  }

  // 8. Typo correction
  parts.push('# 错别字处理');
  parts.push('');
  parts.push('在润色前先做轻量语义纠偏 (但不改变技术含义):');
  parts.push('- 自动修正明显拼写错误 (如 Nodej -> Node.js)');
  parts.push('- 消解指代不清的 它/这个 (改为明确主语)');
  parts.push('- 将口语化需求改为工程师可读描述');
  parts.push('- 若术语不确定 保持原样');
  parts.push('');

  // 9. Intent expansion strategy (简化合并版)
  parts.push('# 延展策略');
  parts.push('');
  parts.push('**延展强度 (根据 level 参数):**');
  parts.push('- **light**: 只纠错, 不延展');
  parts.push('- **medium**: 补充关键信息 - What(对象) + Why(目的) + How(方法)');
  parts.push('- **deep**: 完整方案 - 额外补充 When/Where/Who + 执行细节 + 验证标准');
  parts.push('');
  parts.push('**常见意图类型的延展方向:**');
  parts.push('- **查询型** ("看看", "显示") → 补充: 查询范围/输出格式/筛选条件/时间范围');
  parts.push('- **执行型** ("优化", "修改") → 补充: 执行对象/目标标准/约束条件/验证方法');
  parts.push('- **诊断型** ("分析", "检查") → 补充: 分析对象/分析维度/输出形式/严重等级');
  parts.push('- **建议型** ("怎么做") → 补充: 场景上下文/可选方案/评估标准');
  parts.push('');
  parts.push('**延展核心要求:**');
  parts.push('1. 理解核心意图, 识别用户真正想做什么');
  parts.push('2. 补充执行细节: 输入输出格式/处理重点/约束条件');
  parts.push('3. 保持准确性: 基于合理推断, 不发明事实, 不添加原文未提及的工具/框架');
  parts.push('');

  // 10. Content type detection
  parts.push('# 内容类型识别');
  parts.push('');
  parts.push('根据输入特征自动应用对应微策略:');
  parts.push('- **命令/配置**: 只改叙述文字, 命令/键/值/标志位一律不动');
  parts.push('- **提交信息/PR标题**: 结构为 scope: action - impact, 去除感叹号');
  parts.push('- **Issue描述**: 按 背景/现象/期望/复现步骤/环境 顺序理顺');
  parts.push('- **技术文档**: 条理清晰 前提条件前置');
  parts.push('- **代码注释**: 保持简洁 避免主观语气');
  parts.push('');

  // 10. Output rules
  parts.push('# 输出格式规则');
  parts.push('');
  parts.push('1. 中英文混排时, 英文单词与中文之间加入合理空格 (如 在 Node.js 环境中)');
  parts.push('2. 标题句首不加句号, 列表项末尾统一标点');
  parts.push('3. 列表中的步骤使用动词开头 (如 安装/配置/验证)');
  parts.push('4. 保留原有的引用块 代码块 链接与图片, 不改链接目标');
  parts.push('5. 只给一个版本的结果, 不提供多个选项');
  parts.push('');

  // 11. Anti-patterns
  parts.push('# 负面约束');
  parts.push('');
  parts.push('1. **严禁过度压缩**: 不要为了简洁而牺牲具体性, 尤其是 medium 和 deep 级别.');
  parts.push('2. **避免模糊**: 不要使用"这个"、"那个"等指代不清的词.');
  parts.push('');

  // 12. Executability quality checklist (精简版)
  parts.push('# 可执行性检查');
  parts.push('');
  parts.push('**延展后避免模糊表达:**');
  parts.push('- ❌ 避免: "相关的/适当的/合理的/这个/那个"');
  parts.push('- ✅ 明确: 具体对象/格式/标准/范围/顺序');
  parts.push('');
  parts.push('**延展后必须清晰:**');
  parts.push('- 输入是什么? (明确对象)');
  parts.push('- 输出是什么? (明确格式)');
  parts.push('- 如何验证? (可验证标准)');
  parts.push('- 边界条件? (范围/异常/前提)');
  parts.push('');



  // 12. Input text
  parts.push('---');
  parts.push('');
  parts.push('# 待润色文本');
  parts.push('');

  // 检测文本长度，如果是长文本，添加特别提醒
  const textLength = text.length;
  const isLongText = textLength > 500; // 超过 500 字符视为长文本

  if (isLongText) {
    parts.push('⚠️ **长文本处理特别提醒** ⚠️');
    parts.push('');
    parts.push('下方是一段较长的文本 (' + textLength + ' 字符)。');
    parts.push('');
    parts.push('**请务必:**');
    parts.push('1. **完整阅读** - 从头到尾阅读所有内容，不要遗漏');
    parts.push('2. **保持完整性** - 润色后的输出必须包含原文的所有关键信息');
    parts.push('3. **逐段处理** - 对每一段都进行适当的优化和延展');
    parts.push('4. **验证长度** - 输出长度应该与输入长度相当（根据 level 可能更长）');
    parts.push('');
    parts.push('**如果原文包含多个独立要点/任务/需求:**');
    parts.push('- 每个要点都需要单独优化延展');
    parts.push('- 保持原文的结构和顺序');
    parts.push('- 不要合并或省略任何要点');
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  parts.push('```');
  parts.push(text);
  parts.push('```');
  parts.push('');

  // 14. Final execution reminder
  parts.push('---');
  parts.push('');
  parts.push('⚠️ **CRITICAL - 严格输出约束** ⚠️');
  parts.push('');
  parts.push('**你必须将增强后的提示词包裹在 <dvcode-refine-prompt> 标签中输出。**');
  parts.push('');
  parts.push('**关于解释性文字:**');
  parts.push('- 在 `light` 和 `medium` 级别下, 尽量保持纯净, 只输出标签内容.');
  parts.push('- 在 `deep` 级别下, 你可以在标签之外提供简短的架构说明或建议, 并在末尾进行交互式询问.');
  parts.push('');
  parts.push('**示例格式:**');
  parts.push('### BEGIN RESPONSE ###');
  parts.push('以下是为您增强的提示词方案：');
  parts.push('<dvcode-refine-prompt>');
  parts.push('具体的提示词内容...');
  parts.push('</dvcode-refine-prompt>');
  parts.push('您觉得这个方案如何？是否有特定技术栈要求？');
  parts.push('### END RESPONSE ###');
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('# 执行流程');
  parts.push('');
  parts.push('1. **识别意图**: 深入理解用户的核心目的.');
  parts.push('2. **补全上下文**: 补充必要的 5W1H 和技术背景.');
  parts.push('3. **增强优化**: 根据 level 应用对应的增强策略.');
  parts.push('4. **结构化生成**: 使用 Markdown 优化展示效果.');
  parts.push('');
  parts.push('**你的下一条消息将被解析，立即开始输出包含 <dvcode-refine-prompt> 标签的增强结果:**');

  return parts.join('\n');
}

