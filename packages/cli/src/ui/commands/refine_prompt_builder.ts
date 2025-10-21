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
  parts.push('你是工程写作精修器. 你的任务是在不改变技术含义的前提下, 让文本更清晰, 简洁, 专业, 适合工程师阅读和协作(代码评审, Issue, 文档, 提交说明等).');
  parts.push('');
  
  // 2. Hard constraints
  parts.push('# 硬性约束 (必须遵守)');
  parts.push('');
  
  if (options.keepCode) {
    parts.push('**不改动代码与命令**: 保留代码块, 行内 code, shell/SQL/路径/端口/配置键, 标志位(如 --flag), 版本号, IP/URL, 环境变量, 占位符(如 VAR), 正则, JSON/YAML 字段名. 绝对不修改反引号内文本和三引号代码块.');
    parts.push('');
  }
  
  if (options.keepFormat) {
    parts.push('**结构保留**: 保留 Markdown 标题层级, 列表, 表格, 脚注编号, 引用块与链接文本, 仅在必要时微调标点和空格. 不改变表格列数与对齐, 列表编号顺序.');
    parts.push('');
  }
  
  parts.push('**保持术语与大小写**: 保留框架/库/API 名称 (React, TypeScript, Node.js, HTTP/2, POSIX 等) 的正确大小写和拼写.');
  parts.push('');
  parts.push('**不发明事实**: 不添加不存在的参数, 配置, 依赖或技术细节.');
  parts.push('');
  
  if (options.noEmoji) {
    parts.push('**禁止 Emoji**: 输出中不使用任何表情符号.');
    parts.push('');
  }
  
  // Language settings
  if (options.lang === 'auto') {
    parts.push('**语言**: 自动检测输入语言并使用相同语言输出, 受众为工程师.');
  } else {
    parts.push('**语言**: 使用 ' + options.lang + ' 输出, 保留必要的英文技术术语.');
  }
  parts.push('');
  
  // 3. Tone and Level mapping
  parts.push('# 润色策略');
  parts.push('');
  
  // Tone instructions
  const toneMap: Record<string, string> = {
    neutral: '**语气 - 专业客观**\n- 最通用的工程师语气\n- 清晰表达技术要点\n- 避免主观情绪词',
    friendly: '**语气 - 轻度友好**\n- 适合内部团队沟通\n- 保持专业但不过分正式\n- 可使用 我们 建议 等协作性词汇',
    formal: '**语气 - 正式书面**\n- 适合对外文档 公告 技术规范\n- 使用完整句式\n- 避免口语化表达',
    concise: '**语气 - 精简直达**\n- 最短路径表达\n- 删除所有冗余\n- 适合提交说明 Issue 标题',
    marketing: '**语气 - 轻营销向**\n- 突出价值和亮点\n- 保持技术准确性\n- 可使用有限的形容词',
    tech: '**语气 - 技术纯粹**\n- 保留所有技术术语和行话\n- 最少修辞\n- 适合 API 文档 技术细节',
  };
  parts.push(toneMap[options.tone] || toneMap.neutral);
  parts.push('');
  
  // Level instructions
  const levelMap: Record<string, string> = {
    light: '**强度 - 轻微调整**\n- 只修正拼写错误 标点 语序\n- 不重写句子结构\n- 压缩幅度 <= 20%\n- 若检测到代码/命令密度高 自动采用此级别',
    medium: '**强度 - 适度改写**\n- 重排句子以提升逻辑清晰度\n- 段内小幅调整\n- 消除明显冗余\n- 将前提条件前置\n- **适度延展**: 在用户意图明确但表述过简时, 补充必要的上下文或执行细节 (如: 从 "看看统计" 延展为 "分析统计数据并总结关键指标")',
    deep: '**强度 - 深度重构**\n- 在不改事实前提下可重构段落\n- 突出前提/限制/步骤顺序\n- 优化信息组织\n- 显著提升可读性\n- **深度延展**: 理解用户核心诉求, 将模糊需求转化为具体可执行描述, 补充合理的上下文和操作细节\n- **精准化**: 为 AI 模型提供更多精准表述, 如输入格式/输出要求/处理重点等',
  };
  parts.push(levelMap[options.level] || levelMap.medium);
  parts.push('');
  
  // 4. Style goals
  parts.push('# 风格目标');
  parts.push('');
  parts.push('- **清晰**: 一句一意, 优先主动语态, 技术名词准确, 逻辑顺序: 背景->问题->方案->限制');
  parts.push('- **简洁**: 删除冗余口头语 (其实 就是 然后), 避免重复, 去除感叹号与夸张形容');
  parts.push('- **可执行**: 对需要操作的句子, 保留命令/路径/参数, 不改结构');
  parts.push('- **可审阅**: 关键条件与限制改写为显式前置 (如: 前提 Node.js >= 20)');
  parts.push('');
  
  // 5. Length strategy
  if (options.max) {
    parts.push('# 长度限制');
    parts.push('');
    parts.push('最大输出长度: ' + options.max + ' 字符. 在不损失关键信息的前提下进行语义压缩.');
    parts.push('');
  } else {
    parts.push('# 长度策略');
    parts.push('');
    parts.push('在不损失信息的前提下尽可能简短. 去除冗余 口水话.');
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
  
  // 9. Intent expansion and precision enhancement
  parts.push('# 诉求延展与精准化 (根据强度级别执行)');
  parts.push('');
  parts.push('**核心目标**: 让输出既能纠正错误, 又能延展用户核心意图, 并为 AI 模型提供更精准的上下文.');
  parts.push('');
  parts.push('**延展原则**:');
  parts.push('1. **理解核心意图**: 从简短/模糊的描述中识别用户真正想做什么');
  parts.push('   - 示例: "看看统计" -> "分析当前统计数据的分布情况, 并总结关键指标和趋势"');
  parts.push('   - 示例: "优化性能" -> "分析性能瓶颈, 提供具体优化建议, 包括代码层面和架构层面的改进方案"');
  parts.push('');
  parts.push('2. **补充执行细节**: 为模糊动作添加具体执行方式');
  parts.push('   - 示例: "整理文档" -> "梳理文档结构, 检查内容完整性, 统一格式规范, 更新过时信息"');
  parts.push('   - 示例: "检查代码" -> "审查代码质量, 包括逻辑正确性, 性能问题, 安全漏洞和最佳实践遵循情况"');
  parts.push('');
  parts.push('3. **增强 AI 模型精准度**: 为 AI 提供更多上下文和约束');
  parts.push('   - 明确输入输出格式 (如: "以 Markdown 表格形式输出")');
  parts.push('   - 指定处理重点 (如: "重点关注性能指标")');
  parts.push('   - 添加合理限制 (如: "仅分析最近 30 天的数据")');
  parts.push('   - 指定期望结果形式 (如: "给出 3-5 条可操作建议")');
  parts.push('');
  parts.push('4. **保持技术准确性**: 延展必须基于合理推断, 不发明事实');
  parts.push('   - 只补充通用的执行细节和上下文');
  parts.push('   - 不添加特定工具/框架/方法, 除非原文已提及');
  parts.push('   - 使用开放性描述, 让 AI 根据实际情况判断');
  parts.push('');
  parts.push('**延展强度**:');
  parts.push('- **light 级别**: 只纠错, 不延展');
  parts.push('- **medium 级别**: 适度延展, 补充必要的上下文和执行方向 (延展幅度 1.2-1.5x)');
  parts.push('- **deep 级别**: 深度延展, 将简短需求转化为详细可执行描述, 为 AI 提供丰富上下文 (延展幅度 1.5-2.5x)');
  parts.push('');
  parts.push('**延展示例**:');
  parts.push('- 原文: "梳理下看看" -> medium: "梳理并分析相关数据, 总结关键发现" -> deep: "系统梳理相关数据, 深入分析数据模式和异常点, 生成结构化报告并给出可行性建议"');
  parts.push('- 原文: "优化一下" -> medium: "分析当前问题并提供优化方案" -> deep: "全面分析当前系统/代码的瓶颈和问题, 提供分层次的优化方案 (快速见效 vs 长期优化), 包括具体实施步骤和预期效果"');
  parts.push('- 原文: "帮我看看" -> medium: "审查并给出改进建议" -> deep: "深入审查代码/文档/设计的质量, 从功能正确性, 性能效率, 可维护性多个维度给出具体改进建议, 并标注优先级"');
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
  parts.push('# 输出规则');
  parts.push('');
  parts.push('1. **仅输出润色后的文本**, 不要解释 不要寒暄 不要多余说明');
  parts.push('2. 中英文混排时, 英文单词与中文之间加入合理空格 (如 在 Node.js 环境中)');
  parts.push('3. 标题句首不加句号, 列表项末尾统一标点');
  parts.push('4. 列表中的步骤使用动词开头 (如 安装/配置/验证)');
  parts.push('5. 保留原有的引用块 代码块 链接与图片, 不改链接目标');
  parts.push('6. 只给一个版本的结果, 不提供多个选项');
  parts.push('');
  
  // 11. Quality checklist
  parts.push('# 输出前自检');
  parts.push('');
  parts.push('在输出前确认:');
  parts.push('- 是否改动了任何代码/命令/路径/参数? 若是 必须撤回');
  parts.push('- 是否新增了未在原文出现的技术事实? 若是 必须删除');
  parts.push('- 前提/限制/版本要求是否已前置?');
  parts.push('- 是否显著缩短而不损信息?');
  parts.push('- 语句是否无口水话 无感叹号 无营销词?');
  parts.push('');
  
  // 12. Input text
  parts.push('---');
  parts.push('');
  parts.push('# 待润色文本');
  parts.push('');
  parts.push('```');
  parts.push(text);
  parts.push('```');
  parts.push('');
  
  // 13. Final reminder
  parts.push('---');
  parts.push('');
  parts.push('请严格按照上述规则输出润色后的文本. 记住:');
  parts.push('1. **延展核心诉求**: 理解用户意图, 将简短/模糊表述转化为清晰/可执行的描述');
  parts.push('2. **精准化细节**: 为 AI 模型提供更多上下文, 如输入格式/输出要求/处理重点');
  parts.push('3. **纠正错误**: 修正拼写/语序/标点等明显错误');
  parts.push('4. **不改代码**: 不改代码 命令 参数 路径');
  parts.push('5. **不发明事实**: 延展必须基于合理推断, 不添加不存在的技术细节');
  parts.push('6. **仅输出结果**: 仅输出润色后的文本, 无需解释或寒暄');
  
  return parts.join('\n');
}

