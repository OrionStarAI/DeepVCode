import pptxgen from 'pptxgenjs';
import html2pptx from '/Users/yangbiao/.claude/plugins/marketplaces/anthropic-agent-skills/document-skills/pptx/scripts/html2pptx.js';

async function createPresentation() {
    try {
        console.log('开始创建演示文稿...');

        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_16x9';
        pptx.author = 'DeepV Code Team';
        pptx.title = 'DeepV Code 项目简介';
        pptx.subject = 'AI大模型驱动的代码生成Agent终端应用';

        // 第一张幻灯片 - 封面
        console.log('创建第一张幻灯片...');
        const { slide: slide1 } = await html2pptx('./slide1.html', pptx);

        // 第二张幻灯片 - 技术架构和核心特性
        console.log('创建第二张幻灯片...');
        const { slide: slide2 } = await html2pptx('./slide2.html', pptx);

        // 保存演示文稿
        const filename = 'DeepV_Code_项目简介.pptx';
        await pptx.writeFile({ fileName: filename });

        console.log(`演示文稿创建成功: ${filename}`);
        console.log('包含2张幻灯片：');
        console.log('1. 项目介绍和愿景');
        console.log('2. 技术架构和核心特性');

    } catch (error) {
        console.error('创建演示文稿时出错:', error);
        throw error;
    }
}

// 运行创建函数
createPresentation().catch(console.error);