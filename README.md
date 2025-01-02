# OCR 文字识别应用

一个基于 React 和 Google Gemini API 的高精度 OCR 文字识别应用,支持 LaTeX 数学公式渲染。

## 功能特点

- 支持图片上传、拖拽和粘贴
- 支持图片 URL 识别
- 实时流式输出识别结果
- 支持 LaTeX 数学公式渲染
- 支持多图片批量处理
- 响应式设计,支持移动端



## 本地开发

1. 克隆项目
```bash
git clone https://github.com/yourusername/ocr-app.git
cd ocr-app
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
创建 `.env` 文件并添加:
```
REACT_APP_GEMINI_API_KEY=your_api_key
```

4. 启动开发服务器
```bash
npm start
```

## 部署

本项目支持部署到 Vercel:

1. Fork 本项目
2. 在 Vercel 中导入项目
3. 配置环境变量 `GEMINI_API_KEY`
4. 完成部署

## 技术栈

- React 18
- Google Generative AI SDK
- react-katex (LaTeX 渲染)
- Vercel (部署和 API 路由)

## 注意事项

- 确保图片清晰可读
- 数学公式应有清晰的结构
- API 密钥请妥善保管,不要泄露

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
