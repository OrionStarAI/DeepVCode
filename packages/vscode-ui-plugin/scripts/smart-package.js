const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Smart packaging script - Handle complete version upgrade and packaging process
 * Supports: version type parameters, automatic build, error recovery
 */
function smartPackage() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');

    // Get command line arguments
    const args = process.argv.slice(2);
    const shouldBumpVersion = !args.includes('--no-bump');
    const versionType = args.find(arg => ['major', 'minor', 'patch'].includes(arg)) || 'patch';

    console.log('🚀 Starting smart packaging process...\n');

    try {
        // Backup current version number (for rollback)
        const originalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const originalVersion = originalPackageJson.version;

        let newVersion = originalVersion;

        // 0. Type Check (Safety Net)
        console.log('🛡️  Running type check...');
        try {
            execSync('npm run typecheck', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            console.log('✅ Type check passed\n');
        } catch (error) {
            console.error('❌ Type check failed. Please fix type errors before packaging.');
            process.exit(1);
        }

        // 1. Version upgrade
        if (shouldBumpVersion) {
            console.log(`📈 Upgrading version number (${versionType})...`);
            try {
                execSync(`node scripts/bump-version.js ${versionType}`, {
                    stdio: 'inherit',
                    cwd: path.join(__dirname, '..')
                });

                // Read new version number
                const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                newVersion = updatedPackageJson.version;
                console.log(`✅ Version updated: ${originalVersion} → ${newVersion}\n`);
            } catch (error) {
                console.error('❌ Version upgrade failed:', error.message);
                process.exit(1);
            }
        } else {
            console.log('⏭️  Skipping version upgrade\n');
        }

        // 2. Pre-packaging check and build
        console.log('🔍 Checking build artifacts...');
        try {
            execSync('node scripts/pre-package.js', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
            console.log('');
        } catch (error) {
            console.error('❌ Pre-packaging check failed:', error.message);
            if (shouldBumpVersion) {
                console.log('🔄 Rolling back version...');
                fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');
                console.log(`Version rolled back to: ${originalVersion}`);
            }
            process.exit(1);
        }

        // 3. VS Code extension packaging
        console.log('📦 Packaging VS Code extension...');

        // Temporarily swap README.md with MARKETPLACE.md for packaging
        const readmePath = path.join(__dirname, '..', 'README.md');
        const marketplacePath = path.join(__dirname, '..', 'MARKETPLACE.md');
        const readmeBackupPath = path.join(__dirname, '..', 'README.md.backup');

        let readmeSwapped = false;

        try {
            // Check if MARKETPLACE.md exists
            if (fs.existsSync(marketplacePath)) {
                console.log('📝 Using MARKETPLACE.md for package description...');
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
            const vsixPattern = `deepv-code-vscode-ui-plugin-${newVersion}.vsix`;
            const vsixPath = path.join(__dirname, '..', vsixPattern);

            if (fs.existsSync(vsixPath)) {
                const stats = fs.statSync(vsixPath);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`\n🎉 Packaging successful!`);
                console.log(`📁 File: ${vsixPattern}`);
                console.log(`📏 Size: ${sizeInMB} MB`);

                // Provide next steps suggestions
                console.log(`\n💡 Next steps:`);
                console.log(`   Install for testing: code --install-extension ${vsixPattern}`);
                console.log(`   Publish to marketplace: npx @vscode/vsce publish`);

            } else {
                throw new Error(`Expected VSIX file not found: ${vsixPattern}`);
            }

        } catch (error) {
            console.error('❌ VS Code extension packaging failed:', error.message);
            if (shouldBumpVersion) {
                console.log('🔄 Rolling back version...');
                fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');
                console.log(`Version rolled back to: ${originalVersion}`);
            }
            process.exit(1);
        } finally {
            // Restore original README.md if it was swapped
            if (readmeSwapped && fs.existsSync(readmeBackupPath)) {
                console.log('🔄 Restoring original README.md...');
                fs.copyFileSync(readmeBackupPath, readmePath);
                fs.unlinkSync(readmeBackupPath);
            }
        }

    } catch (error) {
        console.error('❌ Smart packaging failed:', error.message);
        process.exit(1);
    }
}

// If running this script directly, execute smart packaging
if (require.main === module) {
    smartPackage();
}

module.exports = smartPackage;