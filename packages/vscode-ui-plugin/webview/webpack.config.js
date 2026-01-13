const os = require('os');
const path = require('path');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const figlet = require('figlet');

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

module.exports = (env = {}) => ({
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
    clean: true,
    devtoolModuleFilenameTemplate: (info) => {
      return `webpack://${info.namespace}/${info.resourcePath}`;
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              sourceMap: true,
              inlineSourceMap: false,
              inlineSources: false,
              noEmit: false
            }
          }
        },
        exclude: [/node_modules/, /\.test\.tsx?$/]
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/inline'
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  target: 'web',
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'inline-source-map',
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all',
        },
      },
    },
  },
  performance: { hints: false },
  infrastructureLogging: {
    level: 'warn'
  },
  stats: 'errors-warnings',
  cache: env.noCache
    ? false
    : {
        type: 'filesystem',
        cacheDirectory: path.join(os.tmpdir(), 'deepv-webview-webpack-cache')
      },
  ignoreWarnings: [
    /Can't resolve 'utf-8-validate'/,
    /Can't resolve 'bufferutil'/
  ],
  plugins: [
    new ProgressBarPlugin({
      format: chalk.cyan('  Building Webview [:bar] ') + chalk.green(':percent') + chalk.dim(' (:elapsed seconds)'),
      clear: true,
      width: 30,
    }),
    {
      apply: (compiler) => {
        compiler.hooks.beforeRun.tap('BuildStart', () => {
          console.log(chalk.bold.cyan('\nDeepV Webview: Initializing build process...'));
        });

        compiler.hooks.done.tap('BuildEnd', (stats) => {
          if (stats.hasErrors()) {
            console.log(chalk.red('\n❌ DeepV Webview: Build process failed with errors'));
          } else {
            const buildTime = stats.endTime - stats.startTime;
            console.log(chalk.green(`\n✅ DeepV Webview: Build completed successfully (${buildTime}ms)`));
          }
        });

        compiler.hooks.failed.tap('BuildFailed', (error) => {
          console.log(chalk.red('\n[!] DeepV Webview: Critical build failure'));
        });
      }
    }
  ]
});
