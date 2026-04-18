# 前端独立部署指南

本文档说明如何将 OpenMelon 前端独立部署，并连接到单独运行的后端 API。

## 方案选择

### 方案 A：同域反向代理

推荐用于生产环境。

- 前端静态资源由 Nginx 提供
- `/api` 请求反向代理到后端 `http://backend:8000`
- 前端无需修改默认配置，`VITE_API_BASE_URL=/api` 即可

### 方案 B：跨域直连后端

适合前后端分开域名的场景。

- 前端直接请求 `https://api.example.com/api`
- 构建前设置 `VITE_API_BASE_URL=https://api.example.com/api`
- 后端当前已允许跨域请求

## 构建前端

```bash
cd frontend
cp .env.production.example .env.production
npm install
npm run build
```

构建产物位于 `frontend/dist/`。

## Nginx 示例

下面的配置适合同域部署：前端页面和后端 API 使用同一个域名。
仓库内也提供了可直接修改的示例文件：[deploy/nginx/openmelon-frontend.conf](/Users/xiabo/SoftwareTest/CarbonPy/OpenMelon/deploy/nginx/openmelon-frontend.conf)。

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/openmelon;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

部署步骤通常是：

```bash
cp -R frontend/dist/* /var/www/openmelon/
sudo nginx -t
sudo systemctl reload nginx
```

## 不同域部署示例

如果前端站点是 `https://app.example.com`，后端 API 是 `https://api.example.com`：

```bash
cd frontend
cat > .env.production <<'EOF'
VITE_API_BASE_URL=https://api.example.com/api
EOF
npm run build
```

然后将 `frontend/dist/` 部署到静态站点即可。

## 常见问题

### 页面打开正常，但请求失败

优先检查：

- `VITE_API_BASE_URL` 是否正确
- Nginx 是否转发了 `/api/`
- 后端是否已经启动并监听 `8000`
- 浏览器开发者工具里请求的实际 URL 是否符合预期

### 刷新页面返回 404

说明静态站点没有把前端路由回退到 `index.html`。  
Nginx 需要保留：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
