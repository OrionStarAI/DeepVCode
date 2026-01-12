const fs = require('fs');
const path = require('path');

/**
 * Clean npm artifacts before packaging to prevent security issues
 * Removes .npm directories, log files, and other npm-related artifacts
 */
function cleanNpmArtifacts() {
    const rootDir = path.join(__dirname, '..');

    const patternsToClean = [
        '**/.npm',
        '**/_logs',
        '**/npm-debug.log*',
        '**/yarn-debug.log*',
        '**/yarn-error.log*',
        '**/.npmrc',
        '**/.yarnrc'
    ];

    console.log('🧹 Cleaning npm artifacts...');

    let cleanedCount = 0;

    function cleanDirectory(dir) {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip node_modules to avoid breaking dependencies
            if (entry.name === 'node_modules') {
                continue;
            }

            if (entry.isDirectory()) {
                // Clean .npm and _logs directories
                if (entry.name === '.npm' || entry.name === '_logs') {
                    console.log(`   🗑️  Removing: ${path.relative(rootDir, fullPath)}`);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    cleanedCount++;
                } else {
                    // Recursively clean subdirectories
                    cleanDirectory(fullPath);
                }
            } else if (entry.isFile()) {
                // Clean log files
                if (entry.name.match(/^(npm|yarn)-(debug|error)\.log/) ||
                    entry.name === '.npmrc' ||
                    entry.name === '.yarnrc') {
                    console.log(`   🗑️  Removing: ${path.relative(rootDir, fullPath)}`);
                    fs.unlinkSync(fullPath);
                    cleanedCount++;
                }
            }
        }
    }

    cleanDirectory(rootDir);

    if (cleanedCount > 0) {
        console.log(`✅ Cleaned ${cleanedCount} npm artifact(s)`);
    } else {
        console.log('✅ No npm artifacts found to clean');
    }
}

// If running this script directly, execute cleaning
if (require.main === module) {
    cleanNpmArtifacts();
}

module.exports = cleanNpmArtifacts;
