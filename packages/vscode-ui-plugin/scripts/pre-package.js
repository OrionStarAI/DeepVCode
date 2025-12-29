const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Smart pre-packaging script - Ensure all required build artifacts exist
 * Automatically execute build if critical files are missing
 */
function prePackage() {
    const distDir = path.join(__dirname, '..', 'dist');
    const extensionBundlePath = path.join(distDir, 'extension.bundle.js');
    const webviewBuildPath = path.join(__dirname, '..', 'webview', 'build', 'bundle.js');

    const requiredFiles = [
        { path: extensionBundlePath, name: 'Extension Bundle' },
        { path: webviewBuildPath, name: 'Webview Bundle' }
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file.path));

    if (missingFiles.length > 0) {
        console.log('🔍 Missing build artifacts detected:');
        missingFiles.forEach(file => {
            console.log(`   ❌ ${file.name}: ${path.relative(process.cwd(), file.path)}`);
        });

        console.log('\n🚀 Automatically executing build process...');

        try {
            // Execute full build
            console.log('📦 Building project...');
            execSync('npm run build', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });

            // Verify build results
            const stillMissing = requiredFiles.filter(file => !fs.existsSync(file.path));
            if (stillMissing.length > 0) {
                console.error('\n❌ Build completed but still missing the following files:');
                stillMissing.forEach(file => {
                    console.error(`   • ${file.name}: ${path.relative(process.cwd(), file.path)}`);
                });
                process.exit(1);
            }

            console.log('\n✅ Build completed, all required files generated');

        } catch (error) {
            console.error('\n❌ Build failed:', error.message);
            process.exit(1);
        }
    } else {
        console.log('✅ All build artifacts exist, skipping build step');
    }

    // Check file size and integrity
    console.log('\n📊 Build artifacts info:');
    requiredFiles.forEach(file => {
        if (fs.existsSync(file.path)) {
            const stats = fs.statSync(file.path);
            const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`   ✓ ${file.name}: ${sizeInMB} MB`);
        }
    });
}

// If running this script directly, execute pre-packaging check
if (require.main === module) {
    prePackage();
}

module.exports = prePackage;