import { Configuration, DefinePlugin } from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import ZipPlugin from 'zip-webpack-plugin'
import * as path from 'path'
import CopyWebpackPlugin from 'copy-webpack-plugin'
import { VueLoaderPlugin } from 'vue-loader'
import ESLintWebpackPlugin from 'eslint-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'

export class WebpackConfigFactory {
  public static createConfig(
    browser: Browsers,
    isProduction: boolean,
  ): Configuration {
    const mainEntryName =
      browser === Browsers.Chrome ? 'service-worker' : 'background'
    const repositoryRoot = path.join(__dirname, '../..')

    let config: Configuration = {
      mode: isProduction ? 'production' : 'development',
      entry: {
        popup: path.join(__dirname, '../', 'module/popup', 'popup.ts'),
        options: path.join(__dirname, '../', 'module/option', 'options.ts'),
        [mainEntryName]: path.join(
          __dirname,
          '../',
          'module/background',
          'background.ts',
        ),
      },
      devtool: isProduction ? false : 'inline-source-map',
      output: {
        path: path.join(__dirname, '../../dist/' + browser),
        filename: '[name].js',
        globalObject: 'globalThis',
        environment: {
          globalThis: true,
        },
      },
      module: {
        rules: [
          {
            test: /(?:@vue[\\/]runtime-dom[\\/].*\.js|vuetify[\\/]lib[\\/]composables[\\/]theme\.js)$/,
            enforce: 'pre',
            loader: path.join(
              repositoryRoot,
              'scripts/loaders/amo-safe-dom-loader.cjs',
            ),
          },
          {
            test: /\.vue$/,
            loader: 'vue-loader',
            options: {
              compilerOptions: {
                hoistStatic: false,
              },
            },
          },
          {
            test: /\.tsx?$/,
            loader: 'ts-loader',
            exclude: /node_modules/,
            options: {
              appendTsSuffixTo: [/\.vue$/],
            },
          },
          {
            test: /\.(scss|css)$/,
            use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
          },
          {
            test: /\.(woff|woff2|ttf|eot)$/,
            type: 'asset',
          },
        ],
      },
      resolve: {
        extensions: ['.js', '.ts', '.vue'],
        alias: {
          vue$: 'vue/dist/vue.runtime.esm-bundler.js',
        },
      },
      optimization: {
        splitChunks: {
          chunks(chunk) {
            return chunk.name !== 'service-worker'
          },
        },
      },
      plugins: [
        new DefinePlugin({
          __VUE_OPTIONS_API__: JSON.stringify(true),
          __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
        }),
        new CopyWebpackPlugin({
          patterns: [
            {
              from: 'manifest.' + browser + '.json',
              to: 'manifest.json',
              toType: 'file',
            },
            {
              from: '_locales',
              to: '_locales',
            },
            {
              from: 'icon',
              to: 'icon',
            },
            {
              from: path.join(repositoryRoot, 'LICENSE'),
              to: 'LICENSE.txt',
              toType: 'file',
            },
            {
              from: path.join(repositoryRoot, 'NOTICE'),
              to: 'NOTICE.txt',
              toType: 'file',
            },
            {
              from: 'CREDITS.md',
              to: 'CREDITS.txt',
              toType: 'file',
            },
            {
              from: 'THIRD_PARTY_NOTICES.txt',
              to: 'THIRD_PARTY_NOTICES.txt',
              toType: 'file',
            },
            {
              from: 'PRIVACY',
              to: 'PRIVACY.txt',
              toType: 'file',
            },
          ],
        }),
        new HtmlWebpackPlugin({
          template: path.join(__dirname, '../', 'module/popup', 'popup.html'),
          filename: 'popup.html',
          chunks: ['popup'],
        }),
        new HtmlWebpackPlugin({
          template: path.join(
            __dirname,
            '../',
            'module/option',
            'options.html',
          ),
          filename: 'options.html',
          chunks: ['options'],
        }),
        mainEntryName === 'background' &&
          new HtmlWebpackPlugin({
            template: path.join(
              __dirname,
              '../',
              'module/background',
              'background.html',
            ),
            filename: 'background.html',
            chunks: ['background'],
          }),
        new VueLoaderPlugin(),
        new MiniCssExtractPlugin({ filename: '[name].css' }),
        new ESLintWebpackPlugin({
          configType: 'flat',
          cwd: repositoryRoot,
          extensions: ['ts', 'vue'],
        }),
      ].filter(Boolean),
    }

    if (isProduction) {
      if (config.plugins) {
        const zip_options: ZipPlugin.Options = {
          filename: 'package.' + browser + '.zip',
          path: path.join(__dirname, '../../'),
        }
        // @ts-ignore
        config.plugins.push(new ZipPlugin(zip_options))
      }
    }

    return config
  }
}

export interface CliConfigOptions {
  config?: string
  mode?: Configuration['mode']
  env?: string
  'config-register'?: string
  configRegister?: string
  'config-name'?: string
  configName?: string
}

export enum Browsers {
  Chrome = 'chrome',
  Firefox = 'firefox',
}
