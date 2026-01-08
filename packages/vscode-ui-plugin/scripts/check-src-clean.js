const fs = require('fs');
const path = require('path');

function checkDirectory(dir, violations = []) {
  if (!fs.existsSync(dir)) {
    return violations;
  }

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      checkDirectory(itemPath, violations);
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      const basename = path.basename(item.name, ext);

      // Check for build artifacts (but keep .ts source files)
      if (ext === '.js' || ext === '.map' || (ext === '.ts' && basename.endsWith('.d'))) {
        violations.push(itemPath);
      }
    }
  }

  return violations;
}

// Check src directory
const srcDir = path.join(__dirname, '..', 'src');
const violations = checkDirectory(srcDir);

if (violations.length > 0) {
  console.error('❌ Build artifacts found in src directory:');
  violations.forEach(file => console.error(`  - ${file}`));
  console.error('\n🔧 Run "npm run clean:src" to clean up.');
  process.exit(1);
} else {
  console.log('✅ src directory is clean - no build artifacts found.');
  process.exit(0);
}