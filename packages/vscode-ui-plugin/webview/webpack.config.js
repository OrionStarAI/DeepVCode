const path = require('path');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
    clean: true,
    devtoolModuleFilenameTemplate: (info) => {
      // 为调试提供更清晰的源文件路径
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
            // 确保生成源码映射，并且覆盖tsconfig的noEmit设置
            compilerOptions: {
              sourceMap: true,
              inlineSourceMap: false,
              inlineSources: false,
              noEmit: false
            }
          }
        },
        exclude: /node_modules/
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
    // VS Code webview API is provided globally
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
  infrastructureLogging: {
    level: 'warn', // 🚀 只显示基础架构层的警告和错误，忽略缓存恢复失败等信息
  },
  stats: 'errors-warnings', // 🚀 只显示编译过程中的错误和警告
  cache: {
    type: 'filesystem', // 🚀 关键优化：启用文件系统缓存
  },
  ignoreWarnings: [
    // 忽略 ws 库的可选依赖警告（webview 环境中不需要）
    /Can't resolve 'utf-8-validate'/,
    /Can't resolve 'bufferutil'/
  ]
};