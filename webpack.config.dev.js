const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: [path.join(__dirname, "src/index.js")],
  output: {
    path: path.join(__dirname, 'www/', 'scripts/'),
    filename: "hello_webgl.bundle.js"
  },

  module: {
    rules: [
       {
         test: /\.js$/,
         exclude: /(node_modules)/,
         use: {
           loader: 'babel-loader',
           options: {
             presets: ['@babel/preset-env']
           }
         }
       }
     ]
  },

  devtool: "inline-source-map",
  devServer: {
     publicPath: path.resolve(__dirname,'/www', '/scripts'),
     contentBase: path.resolve(__dirname, "www"),
     watchContentBase: true,
     compress: true,
     port: 9000,
  }

};
