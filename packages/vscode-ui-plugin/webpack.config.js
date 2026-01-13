const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');

// chalk v5 is ESM, create a fallback
const createChalk = () => {
  try {
    // Try to use chalk with ESM compatibility
    const chalk = require('chalk').default || require('chalk');
    if (typeof chalk === 'object' && chalk.cyan) {
      return chalk;
    }
  } catch (e) {
    // Fallback: no colors
  }
  // Fallback implementation without colors
  return {
    cyan: (str) => str,
    yellow: (str) => str,
    gray: (str) => str,
    green: (str) => str,
    red: (str) => str,
    dim: (str) => str,
    white: { bold: (str) => str },
    bold: { cyan: (str) => str }
  };
};
const chalk = createChalk();

// 🚀 优化：根据环境变量决定是否启用压缩混淆
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--mode=production');
const shouldMinimize = process.env.MINIMIZE === 'true';

const sharedPlugins = [
  new ProgressBarPlugin({
    format: chalk.cyan('  Bundling Extension [:bar] ') + chalk.green(':percent') + chalk.dim(' (:elapsed seconds)'),
    clear: true,
    width: 30,
  }),
  {
    apply: (compiler) => {
      compiler.hooks.beforeRun.tap('BuildStart', () => {
        if (compiler.name === 'extension') {
          console.log(chalk.bold.cyan('\nDeepV Code Extension: Initializing bundling process...'));
        }
      });

      compiler.hooks.done.tap('BuildEnd', (stats) => {
        if (stats.hasErrors()) {
          console.log(chalk.red(`\n❌ DeepV Code Extension [${compiler.name}]: Bundling process failed with errors`));
        } else if (compiler.name === 'core') {
          // Only log final success for the last bundle in the array (core is second)
          console.log(chalk.green(`\n✅ DeepV Code Extension: Bundling completed successfully`));
        }
      });
    }
  }
];

module.exports = [
  // Extension bundle - 扩展主文件打包
  {
    name: 'extension',
    target: 'node',
    mode: isProduction ? 'production' : 'development',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.bundle.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    externals: {
      // VS Code API - 不打包，运行时由VSCode提供
      'vscode': 'commonjs vscode',
      // Node.js built-ins - VS Code扩展运行在Node.js环境，不需要打包这些
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
      extensions: ['.ts', '.js', '.tsx', '.jsx'], // 确保包含所有扩展名
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'], // 🚀 关键修复：把 .js 映射回 .ts/.tsx
        '.mjs': ['.mts', '.mjs']
      },
      alias: {
        // Replace 'open' package with a stub to avoid import.meta.url cross-platform issues
        'open': path.resolve(__dirname, 'src/stubs/open-stub.ts')
      },
      mainFields: ['module', 'main'],
      // VS Code 扩展环境不需要浏览器版的 polyfills
      aliasFields: []
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
                transpileOnly: true, // 🚀 优化：关闭类型检查
                experimentalWatchApi: true
              }
            }
          ]
        }
      ]
    },
    cache: {
      type: 'filesystem', // 🚀 优化：启用缓存
      buildDependencies: {
        config: [__filename]
      }
    },
    plugins: sharedPlugins,
    optimization: {
      minimize: shouldMinimize,
      minimizer: [
        new TerserPlugin({
          parallel: true, // 🚀 优化：多进程并行压缩
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
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    infrastructureLogging: {
      level: "error"
    },
    stats: "errors-only",
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
    mode: isProduction ? 'production' : 'development',
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
      'zlib': 'commonjs zlib',
      },
    resolve: {
      extensions: ['.js', '.ts'],
      alias: {
        // Replace 'open' package with a stub to avoid import.meta.url cross-platform issues
        'open': path.resolve(__dirname, 'src/stubs/open-stub.ts')
      },
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
      ...sharedPlugins,
      // 复制core包中的HTML模板和icon资源（只复制HTML和图标文件，不复制JS）
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, '../core/dist/src/auth/login/templates'),
            to: path.resolve(__dirname, 'dist/bundled/auth/login/templates'),
            globOptions: {
              // 必须使用绝对路径或相对于 from 目录的路径
              ignore: [
                '**/index.js',
                '**/index.js.map',
                '**/index.d.ts',
                '**/*.ts'
              ]
            },
            // 只复制特定文件类型
            filter: (resourcePath) => {
              // 只允许 HTML, ICO, PNG, SVG, MD 文件
              return /\.(html|ico|png|svg|md)$/i.test(resourcePath);
            }
          }
        ]
      })
    ],
    optimization: {
      minimize: shouldMinimize, // 🚀 优化：同步开启/关闭
      minimizer: [
        new TerserPlugin({
          parallel: true,
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
    infrastructureLogging: {
      level: "error"
    },
    stats: "errors-only",
    ignoreWarnings: [
      // 忽略 ws 库的可选依赖警告
      /Can't resolve 'utf-8-validate'/,
      /Can't resolve 'bufferutil'/
    ]
  }
];