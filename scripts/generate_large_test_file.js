const fs = require('fs');
const path = require('path');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

const filePath = path.join(tempDir, 'large_concurrent_test.json');

console.log('Generating data...');

// Create a large file structure (~10MB+)
// Structure: Header -> Big Data Block 1 -> Middle Target -> Big Data Block 2 -> Footer

const dataBlock1 = Array.from({length: 30000}, (_, i) => ({
    id: `p1_${i}`,
    content: `padding_data_block_1_index_${i}_` + 'x'.repeat(50) // Increase size
}));

const dataBlock2 = Array.from({length: 30000}, (_, i) => ({
    id: `p2_${i}`,
    content: `padding_data_block_2_index_${i}_` + 'y'.repeat(50)
}));

const content = {
    header_config: {
        version: "1.0.0",
        status: "active",
        mode: "test_mode_start"
    },
    data_block_1: dataBlock1,
    middle_config: {
        section: "center_point",
        status: "pending_update",
        check: "verify_me"
    },
    data_block_2: dataBlock2,
    footer_config: {
        copyright: "2024 DeepV Inc",
        contact: "support@example.com",
        end_marker: "EOF"
    }
};

console.log('Writing file...');
fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

const stats = fs.statSync(filePath);
console.log(`Generated large file at: ${filePath}`);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
