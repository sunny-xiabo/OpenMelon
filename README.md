<<<<<<< HEAD
# Test Case Generator

一个基于AI的测试用例生成工具，支持从流程图、思维导图和UI截图生成测试用例。

## 项目结构

```
testcase_generator_platform/
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
=======
# llm-testgen



## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

- [ ] [Create](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#create-a-file) or [upload](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#upload-a-file) files
- [ ] [Add files using the command line](https://docs.gitlab.com/ee/gitlab-basics/add-file.html#add-a-file-using-the-command-line) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://gitlab.miotech.com/miotech-application/esghub/test/llm-testgen.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

- [ ] [Set up project integrations](https://gitlab.miotech.com/miotech-application/esghub/test/llm-testgen/-/settings/integrations)

## Collaborate with your team

- [ ] [Invite team members and collaborators](https://docs.gitlab.com/ee/user/project/members/)
- [ ] [Create a new merge request](https://docs.gitlab.com/ee/user/project/merge_requests/creating_merge_requests.html)
- [ ] [Automatically close issues from merge requests](https://docs.gitlab.com/ee/user/project/issues/managing_issues.html#closing-issues-automatically)
- [ ] [Enable merge request approvals](https://docs.gitlab.com/ee/user/project/merge_requests/approvals/)
- [ ] [Set auto-merge](https://docs.gitlab.com/ee/user/project/merge_requests/merge_when_pipeline_succeeds.html)

## Test and Deploy

Use the built-in continuous integration in GitLab.

- [ ] [Get started with GitLab CI/CD](https://docs.gitlab.com/ee/ci/quick_start/index.html)
- [ ] [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/ee/user/application_security/sast/)
- [ ] [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/ee/topics/autodevops/requirements.html)
- [ ] [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/ee/user/clusters/agent/)
- [ ] [Set up protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
>>>>>>> 92cd1f99b5a415a2432312230e1d30850e2b3b7a
