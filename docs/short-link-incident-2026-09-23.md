# 短链接功能线上失效根因与修复记录

> **日期**: 2026-09-23
> **问题**: 线上短链接功能从未生效——生成分享链接后始终是长链接；修复过程中还曾引发 API 容器健康检查失败
> **影响范围**: 分享交付流程（短链接生成与 `/s/{code}` 公开重定向）
> **状态**: 已修复并在生产环境验证通过（commit `43dfd51`、`b301186`、`0e01eea`）

---

## 根因清单（共 6 个，层层叠加）

后端短链接 API（`759384d`）合入后，整条链路的每一环都没有接通：

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | 前端 | `useShareDelivery.ts` 从未调用 `POST /api/share-links/{id}/short-url`，面板只展示长链接 | 生成分享链接后自动换取短链并优先展示/复制；列表支持补生成 |
| 2 | Nginx | `nginx-prod-ssl.conf` 无 `location /s/`，短链重定向根本到不了 API | 补反向代理到 `:8088` |
| 3 | 配置 | `GALLERY_PUBLIC_BASE_URL` 默认/线上值带 `/g` 后缀，后端拼出 `…/g/g/{slug}`、`…/g/s/{code}` 坏链接 | 默认值改为站点根地址；`M3ShareLinkConfig` 自动剥离已知 `/g` 后缀（警告日志） |
| 4 | 后端 | `SecurityConfig` 白名单未放行 `/s/**`，公开端点被认证链拦截返回 401 | 加入 `permitAll` |
| 5 | 后端 | V15 之前创建的历史分享链接无 `raw_token`，即使绑定短码也无法重定向（死链） | `createShortUrl` 自动轮换 token（新增 `rotateToken` 持久化），旧长链随之失效 |
| 6 | 后端 | 失效短码走 `sendError(404)` → 错误转发 `/error` → `/error` 不在白名单 → **匿名访客看到 401，真实 404 被吞** | 控制器直写标准 API 错误 JSON；同时放行 `/error` 兜底 |

## 事件复盘：修复引出的部署故障

`43dfd51` 首次部署失败（API 容器 unhealthy，崩溃循环）。服务器日志确认根因：

```
java.lang.IllegalStateException: Production configuration error:
GALLERY_PUBLIC_BASE_URL must be the site origin without a path suffix ...
```

首次实现用「启动即失败（fail-fast）」校验 base-url 不得带路径后缀，而服务器
`.env.production` 里正是旧值 `https://gallery.vie-vibe.cn/g`——整个 API 因此起不来。

**处置**：
1. 服务器 `.env.production` 改为 `https://gallery.vie-vibe.cn`（去 `/g` 后缀）并重建容器恢复；
2. `b301186` 将校验降级为警告，base-url 改为运行时自动归一化——URL 样式问题不再有权限杀死整个服务；
3. 顺带发现并修复第 4、6 号根因。

**教训**：对「展示层 URL 拼接」级别的配置问题，fail-fast 的爆炸半径过大；
能自动修复的配置（如已知后缀）应归一化 + 警告，只有无法安全推断的才拒绝启动。

## 定位 /error 二次拦截的方法

现象：新镜像已在跑（字节级比对 `SecurityConfig.class` 一致，`/s/**` 在 permitAll 里），
但 `/s/zzzzzz` 仍 401，而同列表的 `/api/public/g/**` 放行正常。

在 `.env.production` 临时加 `LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_SECURITY=TRACE` 重建容器，日志显示：

```
Securing GET /s/zzzzzz
... AuthorizationFilter (12/12)
... Authorizing GET /s/zzzzzz
Secured GET /s/zzzzzz          ← 安全链其实放行了
Securing GET /error            ← sendError(404) 触发错误转发
... Authorizing GET /error using AuthenticatedAuthorizationManager  ← 这里被拦成 401
```

即 401 来自 `/error` 的二次授权检查，不是 `/s/**` 本身。验证后务必删掉 TRACE 配置。

## 生产环境验证（2026-09-23）

- `GET /s/{有效短码}` → **302** `Location: https://gallery.vie-vibe.cn/g/{slug}?t={rawToken}`，落地页与 `/api/public/g/{slug}?t=` 均 200；
- `GET /s/zzzzzz`（不存在短码）→ **404** `{"code":"SHORT_LINK_NOT_FOUND",...}`（不再是 401）；
- `/actuator/health` 200，全部容器 healthy；
- 管理后台 dist 已含短链 UI（生成后优先展示短链、列表可补生成）。

## 运维备忘

- 服务器 `~/vie-gallery/infra/.env.production` 的 `GALLERY_PUBLIC_BASE_URL` 已改为 `https://gallery.vie-vibe.cn`（不带任何路径）。不要再改回带 `/g` 的值——虽然代码已能自动剥离，但保持配置正确可以避免告警噪音。
- 本地开发：viewer vite 已代理 `/s` 到 `:8088`，`http://localhost:5174/s/{code}` 可直接调试。
- 历史分享链接补生成短链时 token 会被轮换（旧长链接失效），UI 会同时展示新旧两种链接。
