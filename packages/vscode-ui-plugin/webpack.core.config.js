const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: path.resolve(__dirname, '../core/dist/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist/bundled'),
    filename: 'deepv-code-core.js',
    library: {
      type: 'commonjs2'
    }
  },
  externals: {
    // VS Code API
    'vscode': 'commonjs vscode',
    // Node.js built-ins
    'fs': 'commonjs fs',
    'path': 'commonjs path',
    'crypto': 'commonjs crypto',
    'http': 'commonjs http',
    'https': 'commonjs https',
    'url': 'commonjs url',
    'util': 'commonjs util',
    'stream': 'commonjs stream',
    'events': 'commonjs events',
    'buffer': 'commonjs buffer',
    'child_process': 'commonjs child_process',
    'os': 'commonjs os',
    'net': 'commonjs net',
    'tls': 'commonjs tls',
    'zlib': 'commonjs zlib'
  },
  resolve: {
    extensions: ['.js', '.ts'],
    fallback: {
      "fs": false,
      "path": require.resolve("path-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer")
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  optimization: {
    minimize: false // 保持可读性，便于调试
  }
};