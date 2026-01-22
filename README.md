# Test Case Generator

一个基于AI的测试用例生成工具，支持从流程图、思维导图和UI截图生成测试用例。

## 项目结构

```
testcase_generator_20250713/
├── backend/          # FastAPI后端服务
│   ├── main.py      # 主应用入口
│   ├── requirements.txt  # Python依赖
│   ├── routers/     # API路由
│   ├── services/    # 业务逻辑服务
│   ├── models/      # 数据模型
│   ├── utils/       # 工具函数
│   ├── uploads/     # 上传文件存储
│   └── results/     # 生成结果存储
└── frontend/        # React前端应用
    ├── package.json # Node.js依赖
    ├── src/         # 源代码
    └── public/      # 静态资源
```

## 技术栈

### 后端
- **框架**: FastAPI
- **运行时**: Python 3.11+
- **Web服务器**: Uvicorn
- **主要依赖**:
  - FastAPI - Web框架
  - Uvicorn - ASGI服务器
  - Pandas - 数据处理
  - OpenPyXL - Excel文件处理
  - PyPDF2/PDFPlumber - PDF文件处理
  - AutoGen - AI代理框架

### 前端
- **框架**: React 18
- **UI库**: Material-UI (MUI)
- **构建工具**: Create React App
- **主要依赖**:
  - React - 前端框架
  - Material-UI - UI组件库
  - Axios - HTTP客户端
  - React Dropzone - 文件上传
  - React Markdown - Markdown渲染

## 安装和启动

### 环境要求
- Python 3.8 或更高版本
- Node.js 16 或更高版本
- npm 或 yarn

### 后端启动

1. **进入后端目录**
   ```bash
   cd backend
   ```

2. **创建虚拟环境（推荐）**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate
   
   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

4. **配置API密钥（重要）**
   
   复制环境变量示例文件并配置你的API密钥：
   ```bash
   cp .env.example .env
   ```
   
   编辑 `.env` 文件，填入你的API密钥：
   ```env
   # Qwen-VL模型API密钥（用于图像处理）
   QWEN_API_KEY=your_qwen_api_key_here
   
   # DeepSeek模型API密钥（用于文本处理，可选）
   # 如果DeepSeek API密钥无效，系统会自动使用Qwen模型
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   ```
   
   **注意**：
   - 如果没有配置环境变量，系统会使用代码中的默认密钥（可能已过期）
   - 如果DeepSeek API密钥无效，系统会自动使用Qwen模型处理所有文件类型

5. **启动后端服务**
   ```bash
   python main.py
   ```
   
   或者使用uvicorn直接启动：
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **验证后端启动**
   - 访问 http://localhost:8000 查看欢迎信息
   - 访问 http://localhost:8000/docs 查看API文档
   - 访问 http://localhost:8000/api/ping 测试API连通性

### 前端启动

1. **进入前端目录**
   ```bash
   cd frontend
   ```

2. **安装依赖**
   ```bash
   npm install
   ```
   
   或使用yarn：
   ```bash
   yarn install
   ```

3. **启动前端开发服务器**
   ```bash
   npm start
   ```
   
   或使用yarn：
   ```bash
   yarn start
   ```

4. **访问应用**
   - 前端应用将在 http://localhost:3000 启动
   - 浏览器会自动打开应用页面

## 开发模式

### 同时启动前后端

1. **启动后端**（终端1）
   ```bash
   cd backend
   python main.py
   ```

2. **启动前端**（终端2）
   ```bash
   cd frontend
   npm start
   ```

### API接口

后端提供以下主要接口：
- `GET /` - 欢迎信息
- `GET /api/ping` - 健康检查
- `POST /api/generate-test-cases` - 生成测试用例
- 更多接口请查看 http://localhost:8000/docs

### 端口配置

- 后端默认端口: 8000
- 前端默认端口: 3000
- 前端已配置代理，会自动将API请求转发到后端

## 生产部署

### 后端部署
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端部署
```bash
cd frontend
npm run build
# 将build目录部署到Web服务器
```

## 故障排除

### 常见问题

1. **后端启动失败**
   - 检查Python版本是否为3.11+
   - 确保所有依赖已正确安装
   - 检查端口8000是否被占用

2. **前端启动失败**
   - 检查Node.js版本是否为 v22.16.0+
   - 删除node_modules文件夹后重新安装依赖
   - 检查端口3000是否被占用

3. **API请求失败**
   - 确保后端服务正在运行
   - 检查CORS配置
   - 查看浏览器控制台错误信息

4. **API密钥认证错误（401错误）**
   - 检查 `.env` 文件中的API密钥是否正确
   - 验证API密钥是否有效且未过期
   - 如果DeepSeek API密钥无效，系统会自动使用Qwen模型
   - 错误信息示例：`Authentication Fails, Your api key: ****a3f4 is invalid`
     - 这表示DeepSeek API密钥无效，系统已自动切换到Qwen模型

### 日志查看

- 后端日志：在终端中查看uvicorn输出
- 前端日志：在浏览器开发者工具的Console中查看

## 安全注意事项

### API密钥保护

- **重要**：`.env` 文件包含敏感的API密钥，已被添加到 `.gitignore` 中
- 请勿将 `.env` 文件提交到版本控制系统
- 如果 `.env` 文件已经被Git跟踪，请执行以下命令移除：
  ```bash
  git rm --cached backend/.env
  git commit -m "Remove .env from version control"
  ```
- 只提交 `.env.example` 文件作为配置模板

### 其他安全建议

- 定期轮换API密钥
- 在生产环境中使用更安全的密钥管理方式（如密钥管理服务）
- 不要在前端代码中硬编码API密钥

## 贡献

欢迎提交Issue和Pull Request来改进项目。

## 许可证

本项目采用MIT许可证。
