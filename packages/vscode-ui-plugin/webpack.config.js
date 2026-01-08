const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  // Extension bundle - 扩展主文件打包
  {
    name: 'extension',
    target: 'node',
    mode: 'production',
    entry: './src/extension.ts', // 🚀 优化：直接从 TS 源码打包，跳过 tsc 中间步骤
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.bundle.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    externals: {
      // VS Code API - 不打包，运行时由VSCode提供
      'vscode': 'commonjs vscode',
    },
    resolve: {
      extensions: ['.ts', '.js', '.tsx', '.jsx'], // 确保包含所有扩展名
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'], // 🚀 关键修复：把 .js 映射回 .ts/.tsx
        '.mjs': ['.mts', '.mjs']
      },
      mainFields: ['module', 'main'],
      // 确保使用node版本的包
      aliasFields: ['main']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true // 🚀 优化：关闭类型检查
              }
            }
          ]
        }
      ]
    },
    cache: {
      type: 'filesystem', // 🚀 优化：启用缓存
    },
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // 参考CLI的混淆配置
            keep_classnames: false, // 对应 keepNames: false
            keep_fnames: false,     // 对应 keepNames: false
            compress: {
              drop_console: false,  // 保留console，便于调试
              drop_debugger: true,  // 移除debugger
              pure_funcs: [],       // 可以添加需要移除的纯函数
            },
            mangle: {
              // 变量名混淆
              toplevel: false,      // 不混淆顶层作用域（避免破坏导出）
              keep_classnames: false,
              keep_fnames: false,
            },
            format: {
              comments: false,      // 移除注释
            },
          },
          extractComments: false,   // 不提取注释到单独文件
        }),
      ],
      // 禁用代码分割，确保单文件输出
      splitChunks: false
    },
    node: {
      // 保持Node.js全局变量
      __dirname: false,
      __filename: false
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
      level: "log"
    },
    ignoreWarnings: [
      // 忽略 ws 库的可选依赖警告
      /Can't resolve 'utf-8-validate'/,
      /Can't resolve 'bufferutil'/
    ]
  },

  // Core bundle - 保持原有的core打包配置
  {
    name: 'core',
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
    plugins: [
      // 复制core包中的HTML模板和icon资源
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, '../core/dist/src/auth/login/templates'),
            to: path.resolve(__dirname, 'dist/bundled/auth/login/templates'),
            globOptions: {
              ignore: ['**/*.js', '**/*.js.map', '**/*.d.ts']
            }
          }
        ]
      })
    ],
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // 参考CLI的混淆配置
            keep_classnames: false,
            keep_fnames: false,
            compress: {
              drop_console: false,
              drop_debugger: true,
            },
            mangle: {
              toplevel: false,
              keep_classnames: false,
              keep_fnames: false,
            },
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
    },
    ignoreWarnings: [
      // 忽略 ws 库的可选依赖警告
      /Can't resolve 'utf-8-validate'/,
      /Can't resolve 'bufferutil'/
    ]
  }
];