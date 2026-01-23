#!/usr/bin/env node

/**
 * 同步当前分支的增量提交到 github_main 分支
 *
 * 工作原理：
 * 1. 找到 github_main 分支的最后一个 commit
 * 2. 通过 cherry-pick 信息找到对应的原始 commit
 * 3. 将该 commit 之后的所有非 merge commits cherry-pick 到 github_main
 * 4. 遇到冲突时自动使用 --theirs 策略（因为这是单向同步）
 */

import { execSync } from 'child_process';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return result ? result.trim() : '';
  } catch (error) {
    if (options.allowFail) {
      return null;
    }
    throw error;
  }
}

function execQuiet(command) {
  return exec(command, { silent: true });
}

// 检查是否在 git 仓库中
function checkGitRepo() {
  const isGitRepo = exec('git rev-parse --git-dir', { silent: true, allowFail: true });
  if (!isGitRepo) {
    log('❌ 当前目录不是 Git 仓库', colors.red);
    process.exit(1);
  }
}

// 检查 github_main 分支是否存在
function checkGithubMainExists() {
  const branchExists = exec('git rev-parse --verify github_main', { silent: true, allowFail: true });
  if (!branchExists) {
    log('❌ github_main 分支不存在', colors.red);
    log('\n📋 使用前提条件:', colors.yellow);
    log('  1. 本地已创建 github_main 分支', colors.yellow);
    log('  2. 已从内部 GitLab 仓库同步 github_main 分支', colors.yellow);
    log('     git fetch origin github_main', colors.cyan);
    log('     git checkout -b github_main origin/github_main', colors.cyan);
    log('  3. 已添加 GitHub 远程仓库（名为 github）', colors.yellow);
    log('     git remote add github https://github.com/OrionStarAI/DeepVCode.git', colors.cyan);
    process.exit(1);
  }
}

// 检查 github 远程仓库是否存在
function checkGithubRemoteExists() {
  const remoteExists = exec('git remote get-url github', { silent: true, allowFail: true });
  if (!remoteExists) {
    log('❌ 未找到名为 "github" 的远程仓库', colors.red);
    log('\n📋 请先添加 GitHub 远程仓库:', colors.yellow);
    log('   git remote add github https://github.com/OrionStarAI/DeepVCode.git', colors.cyan);
    log('\n💡 或者检查现有远程仓库:', colors.yellow);
    log('   git remote -v', colors.cyan);
    process.exit(1);
  }

  // 显示 github 远程仓库 URL
  const githubUrl = execQuiet('git remote get-url github');
  log(`🔗 GitHub 远程仓库: ${githubUrl}`, colors.blue);
}

// 交互式确认
async function confirm(question) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`\n${question} (y/n): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// 获取当前分支名
function getCurrentBranch() {
  return execQuiet('git rev-parse --abbrev-ref HEAD');
}

// 获取 github_main 的最后一个 commit
function getGithubMainLastCommit() {
  return execQuiet('git rev-parse github_main');
}

// 获取当前分支中某个 commit 之后的所有非 merge commits
function getCommitsSince(commitHash, currentBranch) {
  const commits = execQuiet(
    `git log --oneline --no-merges --reverse ${commitHash}..${currentBranch}`
  );

  if (!commits) {
    return [];
  }

  return commits.split('\n').map(line => {
    const [hash, ...messageParts] = line.split(' ');
    return {
      hash,
      message: messageParts.join(' ')
    };
  });
}

// Cherry-pick 一个 commit，遇到冲突自动使用 theirs 策略
function cherryPickCommit(commitHash, dryRun = false) {
  try {
    if (dryRun) {
      // Dry run 模式：尝试 cherry-pick 但不提交，如果成功则 --abort
      try {
        exec(`git cherry-pick -n ${commitHash}`, { silent: true });
        exec('git cherry-pick --abort', { silent: true, allowFail: true });
        return { success: true };
      } catch (e) {
        // 即使是 dry run，也可能因为冲突而失败
        const errorMsg = (e.stdout || '') + (e.stderr || '') + (e.message || '');
        if (errorMsg.includes('nothing to commit') || errorMsg.includes('The previous cherry-pick is now empty')) {
          exec('git cherry-pick --abort', { silent: true, allowFail: true });
          return { success: true, skipped: true };
        }

        // 检查是否有冲突
        const status = execQuiet('git status --porcelain');
        if (status && (status.includes('UU') || status.includes('AA') || status.includes('DD'))) {
          exec('git cherry-pick --abort', { silent: true, allowFail: true });
          return { success: true, hadConflict: true }; // Dry run 下冲突也被视为“可处理”
        }

        exec('git cherry-pick --abort', { silent: true, allowFail: true });
        return { success: false, error: errorMsg };
      }
    }

    // 实际执行模式
    // 确保没有残留的 cherry-pick 状态
    exec('git cherry-pick --abort', { silent: true, allowFail: true });

    // 尝试直接 cherry-pick
    exec(`git cherry-pick -x ${commitHash}`, { silent: true });
    return { success: true };
  } catch (error) {
    // 获取错误详情
    const errorMsg = (error.stdout || '') + (error.stderr || '') + (error.message || '');

    // 检查是否是因为提交已经应用过而导致的空提交
    if (errorMsg.includes('nothing to commit') || errorMsg.includes('The previous cherry-pick is now empty')) {
      log(`  ⚠️  提交 ${commitHash.substring(0, 8)} 似乎已经应用过或内容重复，跳过...`, colors.yellow);
      exec('git cherry-pick --skip', { silent: true, allowFail: true });
      return { success: true, skipped: true };
    }

    // 检查是否有冲突
    const status = execQuiet('git status --porcelain');
    if (status && (status.includes('UU') || status.includes('AA') || status.includes('DD'))) {
      // 有冲突，使用 theirs 策略
      const conflictFiles = status
        .split('\n')
        .filter(line => line.match(/^(UU|AA|DD)/))
        .map(line => line.substring(3).trim());

      log(`  ⚠️  检测到冲突，自动使用 theirs 策略解决...`, colors.yellow);

      // 对每个冲突文件使用 theirs 策略
      conflictFiles.forEach(file => {
        exec(`git checkout --theirs "${file}"`, { silent: true });
        exec(`git add "${file}"`, { silent: true });
      });

      // 继续 cherry-pick
      try {
        // 使用 -c core.editor=true 避免打开编辑器
        exec('git -c core.editor=true cherry-pick --continue', { silent: true });
      } catch (e) {
        const continueError = (e.stdout || '') + (e.stderr || '') + (e.message || '');
        if (continueError.includes('nothing to commit') || continueError.includes('The previous cherry-pick is now empty')) {
          log(`  ⚠️  冲突解决后提交为空（可能内容已存在），跳过...`, colors.yellow);
          exec('git cherry-pick --skip', { silent: true, allowFail: true });
        } else {
          return { success: false, error: continueError };
        }
      }

      return { success: true, hadConflict: true };
    }

    // 其他错误
    return { success: false, error: errorMsg };
  }
}

// 主函数
async function main() {
  log('\n🚀 开始同步当前分支到 github_main...', colors.bright);

  // 检查环境
  checkGitRepo();
  checkGithubMainExists();
  checkGithubRemoteExists();

  const currentBranch = getCurrentBranch();
  log(`📍 当前分支: ${currentBranch}`, colors.cyan);

  if (currentBranch === 'github_main') {
    log('❌ 不能在 github_main 分支上执行此操作', colors.red);
    process.exit(1);
  }

  // 获取 github_main 的最后一个 commit
  const githubMainLastCommit = getGithubMainLastCommit();
  const githubMainLastCommitMsg = execQuiet(`git log -1 --pretty=%B github_main`);
  log(`🔍 github_main 分支最后一个 commit: ${githubMainLastCommit.substring(0, 8)}`, colors.blue);

  // 因为 github_main 是 orphan 分支，需要通过 cherry-pick 的信息找到对应的原始 commit
  // cherry-pick -x 会在 commit message 中添加 "(cherry picked from commit xxx)" 信息
  let originalCommitHash = null;
  const cherryPickMatch = githubMainLastCommitMsg.match(/\(cherry picked from commit ([0-9a-f]+)\)/);

  if (cherryPickMatch) {
    originalCommitHash = cherryPickMatch[1];
    log(`📌 找到原始 commit: ${originalCommitHash.substring(0, 8)}`, colors.blue);
  } else {
    // 如果没有 cherry-pick 信息，说明可能是初始 commit，从当前分支的第一个 commit 开始
    log(`📌 未找到 cherry-pick 信息，将同步所有非 merge commits`, colors.yellow);
    originalCommitHash = execQuiet(`git rev-list --max-parents=0 ${currentBranch}`);
  }

  // 获取需要同步的 commits
  const commits = getCommitsSince(originalCommitHash, currentBranch);

  if (commits.length === 0) {
    log('✅ 无需同步，github_main 已经是最新的！', colors.green);
    process.exit(0);
  }

  log(`\n📦 发现 ${commits.length} 个新提交需要同步:\n`, colors.bright);
  commits.forEach((commit, index) => {
    log(`  ${index + 1}. ${commit.hash} ${commit.message}`, colors.cyan);
  });

  // Dry-run 模式
  log(`\n🔍 开始 Dry-run 模拟检测...`, colors.blue);
  exec('git checkout github_main');

  let dryRunFailed = false;
  for (const commit of commits) {
    process.stdout.write(`  检测 ${commit.hash.substring(0, 8)}... `);
    const result = cherryPickCommit(commit.hash, true);
    if (result.success) {
      if (result.hadConflict) {
        log('✅ (模拟冲突，将自动解决)', colors.yellow);
      } else if (result.skipped) {
        log('✅ (已存在，将跳过)', colors.yellow);
      } else {
        log('✅ (可顺利应用)', colors.green);
      }
    } else {
      log(`❌ (失败: ${result.error.substring(0, 50)}...)`, colors.red);
      dryRunFailed = true;
    }
  }
  exec(`git checkout ${currentBranch}`);

  if (dryRunFailed) {
    log('\n⚠️  Dry-run 检测到严重错误，建议手动检查后再继续。', colors.red);
  }

  const shouldProceed = await confirm('🔔 是否开始执行实际 cherry-pick 操作？');
  if (!shouldProceed) {
    log('\n👋 用户取消操作。', colors.yellow);
    process.exit(0);
  }

  // 切换到 github_main 分支
  log(`\n🔄 切换到 github_main 分支...`, colors.blue);
  exec('git checkout github_main');

  // Cherry-pick commits
  log(`\n⚙️  开始 cherry-pick (使用 theirs 策略自动解决冲突)...\n`, colors.blue);

  let successCount = 0;
  let conflictCount = 0;
  let failedCommits = [];

  for (const commit of commits) {
    process.stdout.write(`  ${commit.hash.substring(0, 8)} ${commit.message.substring(0, 50)}... `);

    const result = cherryPickCommit(commit.hash);

    if (result.success) {
      successCount++;
      if (result.hadConflict) {
        conflictCount++;
        log('✅ (已解决冲突)', colors.yellow);
      } else {
        log('✅', colors.green);
      }
    } else {
      failedCommits.push({ commit, error: result.error });
      log('❌', colors.red);
    }
  }

  // 切换回原分支
  log(`\n🔄 切换回 ${currentBranch} 分支...`, colors.blue);
  exec(`git checkout ${currentBranch}`);

  // 输出统计信息
  log('\n📊 同步完成统计:', colors.bright);
  log(`  ✅ 成功同步: ${successCount} 个提交`, colors.green);
  if (conflictCount > 0) {
    log(`  ⚠️  自动解决冲突: ${conflictCount} 次`, colors.yellow);
  }
  if (failedCommits.length > 0) {
    log(`  ❌ 失败: ${failedCommits.length} 个提交`, colors.red);
    log('\n失败的提交:', colors.red);
    failedCommits.forEach(({ commit, error }) => {
      log(`  - ${commit.hash} ${commit.message}`, colors.red);
      log(`    错误: ${error}`, colors.red);
    });
  }

  if (successCount > 0) {
    log('\n🎉 同步成功！', colors.green);

    // 1. 推送到 origin
    const pushOrigin = await confirm('📤 是否将 github_main 分支推送到 GitLab (origin)？');
    if (pushOrigin) {
      log('\n🚀 开始推送到 origin...', colors.blue);
      try {
        exec('git push origin github_main');
        log('✅ GitLab (origin) 推送成功！', colors.green);
      } catch (error) {
        log(`❌ GitLab 推送失败: ${error.message}`, colors.red);
      }
    }

    // 2. 推送到 GitHub
    const pushGitHub = await confirm('📤 是否将 github_main 分支推送到 GitHub (github:main)？');
    if (pushGitHub) {
      log('\n🚀 开始推送到 GitHub...', colors.blue);
      try {
        exec('git checkout github_main');
        exec('git push -f github github_main:main');
        exec(`git checkout ${currentBranch}`);
        log('\n✅ GitHub 推送成功！', colors.green);
        log(`🔗 访问 GitHub 查看: https://github.com/OrionStarAI/DeepVCode`, colors.cyan);
      } catch (error) {
        log(`\n❌ GitHub 推送失败: ${error.message}`, colors.red);
        log('💡 你可以手动推送:', colors.cyan);
        log('   git push -f github github_main:main', colors.cyan);
      }
    } else {
      log('\n💡 稍后可以使用以下命令手动推送到 GitHub:', colors.cyan);
      log('   git push -f github github_main:main', colors.cyan);
    }
  }
}

main().catch(error => {
  log(`\n❌ 发生错误: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});