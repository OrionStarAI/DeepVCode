const fs = require('fs');
const path = require('path');

/**
 * Automatically increment version number in package.json
 * Default increment is patch version (third digit)
 * Can specify increment type via command line args: major, minor, patch
 */
function bumpVersion() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');

    try {
        // Read package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const currentVersion = packageJson.version;

        // Parse current version number
        const versionParts = currentVersion.split('.').map(Number);
        if (versionParts.length !== 3) {
            throw new Error(`Invalid version format: ${currentVersion}`);
        }

        let [major, minor, patch] = versionParts;

        // Get version type from command line args, default to patch
        const versionType = process.argv[2] || 'patch';

        switch (versionType) {
            case 'major':
                major++;
                minor = 0;
                patch = 0;
                break;
            case 'minor':
                minor++;
                patch = 0;
                break;
            case 'patch':
            default:
                patch++;
                break;
        }

        const newVersion = `${major}.${minor}.${patch}`;
        packageJson.version = newVersion;

        // Write back to package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

        console.log(`Version bumped from ${currentVersion} to ${newVersion}`);
        return newVersion;

    } catch (error) {
        console.error('Error bumping version:', error.message);
        process.exit(1);
    }
}

// If running this script directly, execute version bump
if (require.main === module) {
    bumpVersion();
}

module.exports = bumpVersion;