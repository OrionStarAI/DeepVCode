/**
 * UI工具 - 交互式命令行界面
 */
import chalk from 'chalk';
import inquirer from 'inquirer';

class UI {
  /**
   * 打印标题
   */
  static printTitle() {
    console.clear();
    console.log(
      chalk.cyan.bold(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║      🚀 远程构建系统 (Remote Build Service)           ║
║                                                        ║
║         VSIX 构建触发服务 (Build Trigger CLI)         ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `)
    );
  }

  /**
   * 打印错误信息
   */
  static printError(message) {
    console.log(chalk.red.bold('✖ 错误:'), message);
  }

  /**
   * 打印成功信息
   */
  static printSuccess(message) {
    console.log(chalk.green.bold('✓ 成功:'), message);
  }

  /**
   * 打印信息
   */
  static printInfo(message) {
    console.log(chalk.blue('ℹ 信息:'), message);
  }

  /**
   * 打印警告信息
   */
  static printWarning(message) {
    console.log(chalk.yellow('⚠ 警告:'), message);
  }

  /**
   * 打印分隔线
   */
  static printSeparator() {
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * 询问用户输入分支名
   */
  static async askBranch() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'branch',
        message: '请输入要拉取的分支名称 (将从远程获取):',
        default: 'main',
        prefix: chalk.yellow('📦'),
        validate: (input) => {
          if (!input.trim()) {
            return '分支名称不能为空';
          }
          return true;
        },
      },
    ]);
    return answers.branch.trim();
  }

  /**
   * 询问是否开始构建
   */
  static async askStartBuild() {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '分支拉取成功，是否在远程构建机上开始构建？ (按 Enter 确认)',
        default: true,
      },
    ]);
    return answers.confirm;
  }

  /**
   * 显示排队状态
   */
  static showQueueStatus(position) {
    console.log(
      chalk.yellow(`\n⏳ 排队中，当前排在第 ${position} 位...\n`)
    );
  }

  /**
   * 显示构建进行中
   */
  static showBuildingStatus() {
    console.log(chalk.cyan('\n▶ 构建进行中...\n'));
  }

  /**
   * 显示构建输出
   */
  static printBuildLogs(logs) {
    console.log(chalk.gray('\n' + '═'.repeat(60)));
    console.log(chalk.gray('构建输出:'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(logs);
    console.log(chalk.gray('═'.repeat(60) + '\n'));
  }

  /**
   * 显示下载URL
   */
  static printDownloadUrl(filename, url) {
    console.log(chalk.green.bold('\n✓ 构建成功！\n'));
    console.log(chalk.gray('ℹ️  版本号基于远程仓库版本自增构建'));
    console.log(chalk.cyan('产物文件:'), filename);
    console.log(chalk.cyan('下载链接:'));
    console.log(chalk.underline.blue(url));
    console.log();
  }

  /**
   * 显示连接错误
   */
  static printConnectionError(serviceUrl) {
    console.log(
      chalk.red.bold(`\n✖ 无法连接到构建服务!\n`)
    );
    console.log(chalk.gray(`服务地址: ${serviceUrl}`));
    console.log(chalk.gray('请确保:'));
    console.log(chalk.gray('  1. 构建服务已启动'));
    console.log(chalk.gray('  2. 网络连接正常'));
    console.log(chalk.gray('  3. 服务地址正确\n'));
  }

  /**
   * 询问是否重试
   */
  static async askRetry() {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: '是否重试？ (按 Enter 确认)',
        default: true,
      },
    ]);
    return answers.retry;
  }

  /**
   * 询问是否开始新的构建任务
   */
  static async askNewBuildTask() {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'newTask',
        message: '是否开始新的构建任务？ (按 Enter 确认)',
        default: true,
      },
    ]);
    return answers.newTask;
  }

  /**
   * 清屏
   */
  static clear() {
    console.clear();
  }

  /**
   * 显示加载动画
   */
  static showSpinner(message) {
    process.stdout.write(chalk.cyan(`\n⟳ ${message}`));
  }

  /**
   * 清除当前行
   */
  static clearLine() {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  /**
   * 显示等待（带动画）
   */
  static async showWaitingAnimation(message, durationSeconds) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        this.clearLine();
        process.stdout.write(
          `\r${frames[frameIndex % frames.length]} ${message}`
        );
        frameIndex++;

        if (Date.now() >= endTime) {
          clearInterval(interval);
          this.clearLine();
          resolve();
        }
      }, 50);
    });
  }
}

export default UI;
