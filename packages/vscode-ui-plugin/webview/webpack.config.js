const path = require('path');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
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
  devtool: 'inline-source-map'
};