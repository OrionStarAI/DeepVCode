const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// --- UI Utilities (ANSI Colors) ---
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
};

function getFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = fs.readFileSync(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
}

function printHeader(title) {
    console.log(`\n${COLORS.bright}${COLORS.blue}>>${COLORS.reset} ${COLORS.bright}${title}${COLORS.reset}`);
}

/**
 * Smart packaging script - Handle complete version upgrade and packaging process
 * Supports: version type parameters, automatic build, error recovery
 */
function smartPackage() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const startTime = Date.now();

    // Get command line arguments
    const args = process.argv.slice(2);
    // CHANGE: Default to NOT bump version (requires explicit version type argument)
    const versionType = args.find(arg => ['major', 'minor', 'patch'].includes(arg));
    const shouldBumpVersion = versionType !== undefined;

    console.log(`\n${COLORS.magenta}${COLORS.bright}🚀 DeepV Code VS Code Extension Packaging Process${COLORS.reset}`);
    console.log(`${COLORS.dim}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.blue}📋 Process Overview:${COLORS.reset}`);
    console.log(`   1. Type check (Safety check)`);
    console.log(`   2. Version upgrade (if not skipped)`);
    console.log(`   3. Production build (Minification enabled)`);
    console.log(`   4. Clean npm artifacts (Security)`);
    console.log(`   5. Extension packaging (VSIX)`);
    console.log(`${COLORS.dim}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);

    try {
        // Backup current version number (for rollback)
        const originalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const originalVersion = originalPackageJson.version;

        let newVersion = originalVersion;

        // 0. Type Check (Safety Net)
        printHeader('Running type check');
        try {
            execSync('npm run typecheck', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}Type check passed${COLORS.reset}`);
        } catch (error) {
            console.error(`  ${COLORS.red}❌${COLORS.reset} ${COLORS.red}Type check failed. Please fix type errors before packaging.${COLORS.reset}`);
            process.exit(1);
        }

        // 1. Version upgrade
        if (shouldBumpVersion) {
            printHeader(`Upgrading version (${versionType})`);
            try {
                execSync(`node scripts/bump-version.js ${versionType}`, {
                    stdio: 'inherit',
                    cwd: path.join(__dirname, '..')
                });

                // Read new version number
                const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                newVersion = updatedPackageJson.version;
                console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}Version updated:${COLORS.reset} ${COLORS.dim}${originalVersion}${COLORS.reset} → ${COLORS.bright}${newVersion}${COLORS.reset}`);
            } catch (error) {
                console.error(`  ${COLORS.red}❌${COLORS.reset} ${COLORS.red}Version upgrade failed: ${error.message}${COLORS.reset}`);
                process.exit(1);
            }
        } else {
            printHeader('Version upgrade');
            console.log(`  ${COLORS.yellow}⏭️${COLORS.reset} ${COLORS.dim}Skipping version upgrade${COLORS.reset}`);
        }

        // 2. Pre-packaging check and build
        printHeader('Production build');
        try {
            // Force a production build with minimization enabled
            execSync('npm run build:prod', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}Production build completed${COLORS.reset}`);
        } catch (error) {
            console.error(`  ${COLORS.red}❌${COLORS.reset} ${COLORS.red}Pre-packaging check failed: ${error.message}${COLORS.reset}`);
            if (shouldBumpVersion) {
                console.log(`  ${COLORS.yellow}🔄${COLORS.reset} ${COLORS.dim}Rolling back version...${COLORS.reset}`);
                fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');
                console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.dim}Version rolled back to: ${originalVersion}${COLORS.reset}`);
            }
            process.exit(1);
        }

        // 3. Clean npm artifacts (CRITICAL for security)
        printHeader('Cleaning npm artifacts');
        try {
            execSync('node scripts/clean-npm-artifacts.js', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}npm artifacts cleaned${COLORS.reset}`);
        } catch (error) {
            console.error(`  ${COLORS.yellow}⚠️${COLORS.reset} ${COLORS.yellow}Failed to clean npm artifacts: ${error.message}${COLORS.reset}`);
            // Don't fail the build, just warn
        }

        // 4. VS Code extension packaging
        printHeader('Extension packaging');

        // Temporarily swap README.md with MARKETPLACE.md for packaging
        const readmePath = path.join(__dirname, '..', 'README.md');
        const marketplacePath = path.join(__dirname, '..', 'MARKETPLACE.md');
        const readmeBackupPath = path.join(__dirname, '..', 'README.md.backup');

        let readmeSwapped = false;
        let vsixPattern = `deepv-code-vscode-ui-plugin-${newVersion}.vsix`;

        try {
            // Check if MARKETPLACE.md exists
            if (fs.existsSync(marketplacePath)) {
                console.log(`  ${COLORS.blue}📝${COLORS.reset} ${COLORS.dim}Using MARKETPLACE.md for package description...${COLORS.reset}`);
                // Backup original README.md
                if (fs.existsSync(readmePath)) {
                    fs.copyFileSync(readmePath, readmeBackupPath);
                }
                // Copy MARKETPLACE.md to README.md
                fs.copyFileSync(marketplacePath, readmePath);
                readmeSwapped = true;
            }

            execSync('npx @vscode/vsce package', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });

            // Check generated VSIX file
            const vsixPath = path.join(__dirname, '..', vsixPattern);

            if (fs.existsSync(vsixPath)) {
                const stats = fs.statSync(vsixPath);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                const fileHash = getFileHash(vsixPath);

                // Final Summary
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log(`\n${COLORS.bright}${COLORS.blue}----------------------- Package Summary -----------------------${COLORS.reset}`);
                console.log(`${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}${'Artifact'.padEnd(15)}${COLORS.reset} [${COLORS.bright}${vsixPattern}${COLORS.reset}]`);
                console.log(`${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}${'Version'.padEnd(15)}${COLORS.reset} [${COLORS.bright}${newVersion}${COLORS.reset}]`);
                console.log(`${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}${'Size'.padEnd(15)}${COLORS.reset} [${COLORS.bright}${sizeInMB} MB${COLORS.reset}]`);
                console.log(`${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}${'SHA-256'.padEnd(15)}${COLORS.reset} ${COLORS.dim}${fileHash}${COLORS.reset}`);
                console.log(`${COLORS.green}✅${COLORS.reset} ${COLORS.cyan}${'Status'.padEnd(15)}${COLORS.reset} [${COLORS.green}${COLORS.bright}SUCCESS${COLORS.reset}]`);
                console.log(`${COLORS.bright}${COLORS.blue}---------------------------------------------------------------${COLORS.reset}`);

                console.log(`\n${COLORS.green}🎉 Extension packaged successfully in ${duration}s!${COLORS.reset}`);
                console.log(`\n${COLORS.yellow}${COLORS.bright}Next steps:${COLORS.reset}`);
                console.log(`   ${COLORS.dim}Install:${COLORS.reset} code --install-extension ${vsixPattern}`);
                console.log(`   ${COLORS.dim}Publish:${COLORS.reset} npx @vscode/vsce publish\n`);

            } else {
                throw new Error(`Expected VSIX file not found: ${vsixPattern}`);
            }

        } catch (error) {
            console.error(`  ${COLORS.red}❌${COLORS.reset} ${COLORS.red}VS Code extension packaging failed: ${error.message}${COLORS.reset}`);
            if (shouldBumpVersion) {
                console.log(`  ${COLORS.yellow}🔄${COLORS.reset} ${COLORS.dim}Rolling back version...${COLORS.reset}`);
                fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');
                console.log(`  ${COLORS.green}✅${COLORS.reset} ${COLORS.dim}Version rolled back to: ${originalVersion}${COLORS.reset}`);
            }
            process.exit(1);
        } finally {
            // Restore original README.md if it was swapped
            if (readmeSwapped && fs.existsSync(readmeBackupPath)) {
                console.log(`  ${COLORS.blue}🔄${COLORS.reset} ${COLORS.dim}Restoring original README.md...${COLORS.reset}`);
                fs.copyFileSync(readmeBackupPath, readmePath);
                fs.unlinkSync(readmeBackupPath);
            }
        }

    } catch (error) {
        console.error(`\n${COLORS.red}❌ Smart packaging failed: ${error.message}${COLORS.reset}`);
        process.exit(1);
    }
}

// If running this script directly, execute smart packaging
if (require.main === module) {
    smartPackage();
}

module.exports = smartPackage;