# Toolii 安全审计报告

**日期**: 2026-03-05
**审计范围**: 全栈代码审计（后端 Python/FastAPI + 前端 React + Docker 部署）
**审计方法**: 6 个专业审计维度并行分析

---

## 资产价值分析

| 资产 | 价值 | 威胁场景 |
|------|------|---------|
| **用户密码/认证系统** | 极高 | JWT 伪造 -> 完全接管任意账户 |
| **积分/卡密系统** | 高 | 管理员自我提权、伪造卡密 -> 经济损失 |
| **用户上传文件** | 高 | 路径穿越、未授权下载 -> 数据泄露 |
| **GPU/LLM API 密钥** | 高 | 密钥泄露 -> 资源滥用、费用损失 |
| **Cortex GPU 服务** | 高 | 端口暴露 -> 资源滥用、DoS |
| **用户 PII（邮箱/IP）** | 中 | 日志泄露 -> 合规风险 |
| **服务可用性** | 中 | 像素炸弹/PDF 炸弹 -> OOM 宕机 |

---

## 发现汇总

| 严重程度 | 数量 |
|---------|------|
| CRITICAL | 3 |
| HIGH | 10 |
| MEDIUM | 13 |
| LOW | 10 |

---

## CRITICAL (必须立即修复)

### C-01: 生产密钥存储在开发机 .env 文件中
- **位置**: `/.env`（项目根目录）
- **描述**: `.env` 文件包含所有生产环境真实密钥（JWT_SECRET_KEY、RESEND_API_KEY、LLM_API_KEY、DOWNLOAD_SIGNING_SECRET、Cortex 内网 IP）。虽然 `.gitignore` 已排除，但密钥直接暴露在开发机磁盘上。
- **影响**: 开发机被入侵或任何有文件系统访问权的人可获取全部密钥，伪造任意 JWT、滥用邮件/LLM API。
- **修复**:
  1. 立即轮换所有密钥
  2. 生产密钥仅存在于部署环境（Docker secrets / 环境变量注入），开发机使用独立弱密钥
  3. `git log --all -p -- .env` 确认未曾提交

### C-02: Cortex GPU 服务端口无认证暴露到 0.0.0.0
- **位置**: `docker/docker-compose.yml:62`, `backend/app/services/cortex_client.py`
- **描述**: Cortex 在独立 GPU 主机上运行，端口绑定 `"9100:9100"`（0.0.0.0），且无任何认证机制。backend 通过 Tailscale 内网 IP 跨主机访问。GPU 主机上任何网络接口都能直接调用 Cortex API，包括 `/admin/unload-all` 等管理端点。
- **影响**: GPU 资源滥用、DoS（卸载所有模型）、信息泄露。
- **注意**: 两个服务不在同一台主机，不能简单绑定 `127.0.0.1`。
- **修复**:
  1. Cortex 服务端添加 API 密钥认证（检查 `X-API-Key` header）
  2. backend 的 `cortex_client.py` 在请求中附带 `CORTEX_API_KEY` header
  3. GPU 主机的防火墙仅放行 Tailscale 接口上的 9100 端口（`ufw allow in on tailscale0 to any port 9100`）
  4. docker-compose 中绑定到 Tailscale IP 而非 0.0.0.0

### C-03: JWT Secret 使用不安全默认值 "CHANGE_ME"，dev 环境仅警告不阻止
- **位置**: `backend/app/core/config.py:35, 106-114`
- **描述**: `jwt_secret_key` 默认值为 `"CHANGE_ME"`，`env` 默认值为 `"dev"`。如果生产环境忘记设 `ENV=production`，所有 JWT 使用可预测密钥签名。
- **影响**: 攻击者可伪造管理员 token，完全接管系统。
- **修复**: dev 环境也应生成随机临时 secret（`secrets.token_hex(32)`），而非使用固定默认值。

---

## HIGH (尽快修复)

### H-01: Refresh Token 刷新时未做 Token Rotation
- **位置**: `backend/app/routers/auth.py:154-171`, `backend/app/services/auth_service.py:206-233`
- **描述**: 刷新 token 后旧 refresh token 未加入黑名单，30 天内可无限次使用。
- **修复**: 刷新成功后立即将旧 refresh token 的 JTI 加入黑名单。

### H-02: LoginGuard 仅基于内存，无 IP 维度防护
- **位置**: `backend/app/core/login_guard.py:21-83`
- **描述**: 纯内存存储（重启丢失），仅按 email 维度锁定。攻击者可对大量不同 email 进行 credential stuffing。
- **修复**: 增加 IP 维度计数，持久化到 Redis/DB。

### H-03: dev 模式在 API 响应中返回验证 Token 和重置 Token
- **位置**: `backend/app/routers/auth.py:99, 266, 284`
- **描述**: `settings.env == "dev"` 时直接在响应体返回敏感 token。结合 C-03（env 默认 dev），生产误配时会泄露。
- **修复**: 改用日志输出，或添加 localhost 请求检测。

### H-04: 管理员可给自己无限调整积分
- **位置**: `backend/app/routers/admin/users.py:69-94`, `backend/app/services/admin_service.py:296-332`
- **描述**: 无 `user_id == admin.id` 检查，`amount` 无上限。
- **修复**: 禁止自操作或需双人审批，`amount` 添加 `le=100000`。

### H-05: 卡密积分值无上限
- **位置**: `backend/app/schemas/admin.py:113-118`
- **描述**: `credits` 仅有 `ge=1`，可生成面值数十亿的卡密。
- **修复**: 添加 `le=100000` 上限。

### H-06: 管理 API 无速率限制
- **位置**: `backend/app/routers/admin/` 全部文件
- **描述**: 管理写操作（生成卡密、调整积分、删除数据）无速率限制。admin token 被盗后可无限速调用。
- **修复**: 对写操作添加严格速率限制。

### H-07: 审计日志静默失败，不阻断业务
- **位置**: `backend/app/core/audit_log.py:85-88`
- **描述**: 审计写入失败仅 warning，高危操作仍继续执行。审计系统故障期间无审计踪迹。
- **修复**: 高危操作的审计应是事务一部分，失败时回滚。

### H-08: cv2 处理路径无像素限制（OOM 风险）
- **位置**: `backend/app/processing/scan_enhance.py:48-49`, `backend/app/processing/face_detection.py:311-313`
- **描述**: `cv2.imdecode()` 不受 Pillow `MAX_IMAGE_PIXELS` 保护。30000x30000 JPEG 解压后占 2.7GB 内存。
- **修复**: 解码后立即检查 `img.shape[0] * img.shape[1]` 是否超限。

### H-09: Docker 容器以 root 运行
- **位置**: `docker/Dockerfile.backend`, `docker/Dockerfile.cortex`
- **描述**: 无 `USER` 指令。RCE 漏洞 + volume mount 可影响宿主机。
- **修复**: 添加非 root 用户 `RUN useradd -r appuser && USER appuser`。

### H-10: Docker Compose CORS_ORIGINS 覆盖 .env 配置
- **位置**: `docker/docker-compose.yml:14`
- **描述**: `environment` 中硬编码 `CORS_ORIGINS: http://localhost`，覆盖 `.env` 中的生产域名。实际生产 CORS 可能是 `http://localhost`。
- **修复**: 从 `environment` 中移除 `CORS_ORIGINS`，统一从 `.env` 读取。

---

## MEDIUM (计划修复)

### M-01: 多个密码字段缺少 max_length
- **位置**: `backend/app/schemas/auth.py:18` (LoginRequest.password), `schemas/auth.py:21-23` (GoogleAuthRequest), `schemas/auth.py:37-38` (VerifyEmailRequest.token), `schemas/user.py:19-21` (ChangePasswordRequest.current_password)
- **描述**: 攻击者可发送超大字符串消耗内存。
- **修复**: 统一添加 `max_length=128`（密码）/`max_length=4096`（token）。

### M-02: WebP/GIF/BMP/TIFF/HEIC 图片缺少尺寸检查
- **位置**: `backend/app/core/file_validation.py:49-66`
- **描述**: 仅 JPEG/PNG 检查尺寸，其他格式可绕过 `_MAX_DIMENSION=10000` 限制。
- **修复**: 对所有格式统一用 Pillow 检查尺寸。

### M-03: PDF 处理无页数限制
- **位置**: `backend/app/processing/pdf_*.py`
- **描述**: 数千页 PDF 可耗尽 CPU/内存。
- **修复**: 添加页数上限（如 500 页）和处理超时。

### M-04: Google OAuth 使用 access_token 而非 id_token
- **位置**: `backend/app/services/auth_service.py:118-143`
- **描述**: 未验证 token audience，其他应用的 Google access_token 理论上可登录 Toolii。
- **修复**: 改用 id_token 验证并检查 audience。

### M-05: bcrypt 预哈希的 null byte 截断风险
- **位置**: `backend/app/core/security.py:22-23`
- **描述**: SHA-256 digest（bytes）可能含 `\x00`，某些 bcrypt 实现会截断。
- **修复**: `digest = base64.b64encode(hashlib.sha256(password.encode()).digest())`

### M-06: 无管理员权限分级
- **位置**: `backend/app/models/user.py:24`
- **描述**: 仅 `is_admin: bool`，所有管理员拥有相同全部权限。
- **建议**: 实现 RBAC（super_admin / admin / operator）。

### M-07: nginx 静态资源 location 安全头丢失
- **位置**: `docker/nginx.conf:55-58`
- **描述**: 嵌套 location 的 `add_header` 覆盖父级，导致 JS/CSS 等静态资源丢失 CSP/X-Frame-Options 等安全头。
- **修复**: 在嵌套 location 中用 `include` 引入共享安全头。

### M-08: CSP script-src 含 unsafe-inline
- **位置**: `docker/nginx.conf:23`
- **描述**: 削弱了 CSP 对 XSS 的防护。
- **修复**: 移除 `'unsafe-inline'`，改用 nonce/hash。

### M-09: Transfer message 字段缺少 Form 层长度限制
- **位置**: `backend/app/routers/transfer.py:36`
- **修复**: `message: str | None = Form(None, max_length=500)`

### M-10: Download unlock 端点缺少所有权验证
- **位置**: `backend/app/routers/download.py:56-127`
- **描述**: file_id 泄露后任何认证用户可 unlock。
- **修复**: metadata 中记录 `owner_user_id`，unlock 时验证。

### M-11: 请求体大小限制不一致
- **位置**: nginx 110MB vs 后端中间件 550MB
- **修复**: 统一为相同值。

### M-12: 审计日志/processing_history 中的 PII
- **描述**: 邮箱明文记录在审计日志，IP/UA 记录在 processing_history 且无清理机制。
- **修复**: 邮箱脱敏，IP 定期清理。

### M-13: DevEmailService 在日志中打印 token
- **位置**: `backend/app/services/email/dev.py:17-23`
- **修复**: 非 dev 模式下拒绝初始化。

---

## LOW (安全加固)

### L-01: 密码策略仅限长度，无复杂度要求
### L-02: Transfer 提取码仅 4 位数字（10000 种组合）
### L-03: 登录时的时序差异可用于邮箱枚举
### L-04: download_signing_secret 同样有不安全默认值
### L-05: FastAPI /docs /redoc 端点未在生产禁用
### L-06: .gitignore 中 `**/models/` 规则过于宽泛
### L-07: Source Map 未显式禁用
### L-08: robots.txt 暴露 /console/ 管理后台路径
### L-09: python-jose 库维护不活跃（建议迁移到 PyJWT）
### L-10: window.open 缺少 noopener,noreferrer（AdminFilesPage.tsx:86）

---

## 安全设计亮点（做得好的地方）

1. **文件 ID 系统**: UUID4 hex + 正则验证 `^[a-f0-9]{32}$`，完全杜绝路径穿越
2. **下载签名**: HMAC-SHA256 + 过期时间 + `hmac.compare_digest` 防时序攻击
3. **Token 架构**: Access Token 内存存储 + Refresh Token HttpOnly Cookie（Secure/SameSite=Lax）
4. **防邮箱枚举**: forgot_password 始终返回相同响应
5. **密码重置后全局撤销**: `tokens_revoked_at` 时间戳机制
6. **验证 Token 哈希存储**: 数据库仅存 SHA-256 哈希
7. **积分系统并发安全**: `with_for_update()` 行级锁 + 原子操作
8. **无 SQL 注入**: 全部使用 SQLAlchemy ORM 参数化查询
9. **无命令注入**: 未发现 subprocess/os.system/eval 调用
10. **无 SSRF**: HTTP 外部请求仅到固定 URL（Google API / Cortex）
11. **管理 API 鉴权一致**: 所有 12 个 admin 路由文件均使用 `Depends(get_admin_user)`
12. **卡密安全**: 数据库仅存 code_hash，明文只在生成时返回一次
13. **IP 自动封禁**: 速率限制触发 5 次后自动封禁 IP 10 分钟
14. **文件浏览器白名单**: 管理员文件浏览仅限预定义目录，无法读取 .env/数据库

---

## 修复进度

### 已修复 (2026-03-05)

| 编号 | 修复项 | 修改文件 |
|------|--------|---------|
| C-02 | Cortex API Key 认证 + 端口绑定到可配置 IP | `cortex/app/config.py`, `cortex/app/main.py`, `backend/app/core/config.py`, `backend/app/services/cortex_client.py`, `docker/docker-compose.yml` |
| C-03 | JWT secret / download_signing_secret 默认值改为 `secrets.token_hex(32)` | `backend/app/core/config.py` |
| H-03 | dev token 不再返回响应体，改为 logger.info | `backend/app/routers/auth.py` |
| H-04 | 管理员禁止给自己调整积分 | `backend/app/routers/admin/users.py` |
| H-05 | 卡密积分上限 `le=100000`，调整积分范围 `[-100000, 100000]` | `backend/app/schemas/admin.py` |
| H-08 | cv2 解码后检查像素数（30MP 上限），3 处 imdecode 全覆盖 | `backend/app/core/file_validation.py`, `backend/app/processing/scan_enhance.py`, `backend/app/processing/face_detection.py`, `backend/app/processing/face_compliance.py` |
| H-10 | 移除 docker-compose 硬编码 CORS_ORIGINS | `docker/docker-compose.yml` |
| M-01 | 所有密码字段 `max_length=128`，token 字段 `max_length=4096` | `backend/app/schemas/auth.py`, `backend/app/schemas/user.py` |
| M-02 | WebP/GIF/BMP/TIFF/HEIC 统一 Pillow 尺寸检查 | `backend/app/core/file_validation.py` |
| M-05 | bcrypt 预哈希改用 base64 编码避免 null byte 截断 | `backend/app/core/security.py` |
| M-09 | Transfer message 字段 `max_length=500` | `backend/app/routers/transfer.py` |
| L-04 | download_signing_secret 随机默认值（同 C-03） | `backend/app/core/config.py` |
| L-05 | 非 dev 环境禁用 /docs /redoc | `backend/app/main.py` |
| L-08 | robots.txt 移除 /console/ 管理后台路径暴露 | `frontend/public/robots.txt` |
| L-10 | window.open 添加 noopener,noreferrer | `frontend/src/pages/Admin/AdminFilesPage.tsx` |

**部署注意**: M-05 修改了密码哈希预处理方式，已有用户密码需重置。

### 已修复 (第二批)

| 编号 | 修复项 | 修改文件 |
|------|--------|---------|
| H-01 | Refresh Token Rotation — 刷新后旧 token JTI 加入黑名单 | `backend/app/services/auth_service.py` |
| H-06 | 管理 API 写操作速率限制 `10/minute`（卡密生成、积分调整、删除等 12 个端点） | `backend/app/core/config.py`, `backend/app/core/rate_limiter.py`, `backend/app/routers/admin/{cards,users,system,storage,transfers,feedback,tools}.py` |
| M-03 | PDF 页数限制 500 页上限（`check_pdf_page_count`） | `backend/app/core/config.py`, `backend/app/core/file_validation.py`, `backend/app/routers/pdf.py` |
| M-10 | Download unlock 所有权验证 — 文件 metadata 记录 `owner_user_id`，unlock 时校验 | `backend/app/core/tool_recording.py`, `backend/app/services/image_service.py`, `backend/app/services/pdf_service.py`, `backend/app/routers/{image,pdf,download}.py` |
| M-11 | 请求体大小限制统一 — nginx 和后端中间件均为 550MB | `docker/nginx.conf`, `backend/app/core/security_headers.py` |
| M-13 | DevEmailService 非 dev 环境拒绝初始化（RuntimeError） | `backend/app/services/email/factory.py` |
| L-01 | 密码复杂度要求 — 至少含大写、小写、数字 | `backend/app/schemas/validators.py` (new), `backend/app/schemas/auth.py`, `backend/app/schemas/user.py` |
| L-02 | Transfer 提取码从 4 位纯数字改为 6 位字母+数字 (2.18B 组合) | `backend/app/services/transfer_service.py` |
| L-06 | .gitignore models 规则优化 — `**/models/` → `/models/` + `*.task` + `*.onnx` | `.gitignore` |
| L-07 | Source Map 显式禁用 `sourcemap: false` | `frontend/vite.config.ts` |
| L-09 | python-jose → PyJWT 迁移 | `backend/app/core/security.py`, `backend/app/core/tool_recording.py`, `backend/pyproject.toml` |

### 已修复 (第三批)

| 编号 | 修复项 | 修改文件 |
|------|--------|---------|
| M-07 | nginx 嵌套 location 安全头继承 — 提取共享 `security-headers.conf` 片段，在静态资源 location 中 include | `docker/security-headers.conf` (new), `docker/nginx.conf`, `docker/Dockerfile.web` |
| M-08 | CSP `script-src` 移除 `'unsafe-inline'` — 前端为 Vite 打包的纯外部 module script，无需 inline | `docker/security-headers.conf` |

**部署注意 (第三批)**:
- M-07/08: 需 Docker 重建 web 容器生效。如果 GTM 注入 inline script 导致被 CSP 阻断，需在 `security-headers.conf` 的 `script-src` 中加回 `'unsafe-inline'`

**部署注意 (第二批)**:
- L-01: 已有用户不受影响（仅新设密码时校验），但建议提示弱密码用户更新
- L-02: 已有 transfer 提取码不变，仅新创建的 transfer 使用 6 位码
- L-09: python-jose 已移除，PyJWT 替代，JWT 格式完全兼容
- M-11: nginx `client_max_body_size` 需在 Docker 重建后生效

### 待修复 — 需要运维/设计决策

| 编号 | 修复项 | 说明 |
|------|--------|------|
| C-01 | 密钥轮换 + 生产密钥管理 | 纯运维操作 |
| H-02 | LoginGuard IP 维度 + 持久化 | 需 Redis/DB 方案决策 |
| H-07 | 审计日志事务化 | 需确认高危操作范围 |
| H-09 | Docker 非 root 用户 | 需改 Dockerfile + 重建 |
| M-04 | Google OAuth id_token 验证 | 需确认是否影响现有登录流程 |
| M-06 | 管理员权限分级 RBAC | 大改动，需架构设计 |
| ~~M-07/08~~ | ~~nginx 安全头 + CSP~~ | 已修复 (第三批) |
| M-12 | PII 脱敏 / IP 定期清理 | 需产品决策 |
