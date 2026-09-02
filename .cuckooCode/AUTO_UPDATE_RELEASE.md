# Cuckoo Code 自动更新与发布方案（含每步原因）

本文档详细说明 Cuckoo Code 的自动更新机制、发布流程，以及每一步操作背后的原因。

---

## 一、自动更新机制概览

### 1.1 判断"是否有新版本"的原理

**不是靠时间、不是靠 Git tag、不是靠数据库，而是靠一个元数据文件。**

electron-builder 打包时会生成 `latest.yml`（Windows）/ `latest-mac.yml`（macOS），
其中记录了最新版本号、安装包下载地址、文件哈希等信息。

应用启动后，`electron-updater` 会：

1. 向更新源（GitHub Releases）请求 `latest.yml`
2. 读取其中的 `version` 字段（远端最新版本号）
3. 读取本地 `app.getVersion()`（本地已安装版本号）
4. 用 semver 比较：远端 > 本地 才触发更新

**关键结论**：
- 如果 `latest.yml` 不存在，永远检测不到更新
- 如果远端版本号 ≤ 本地版本号，永远不更新
- 所以每次发版必须递增 `package.json` 的 `version`，且打包产物（安装包 + latest.yml + blockmap）必须一起发布

### 1.2 latest.yml 长什么样

```yaml
version: 0.2.1
files:
  - url: cuckoo-code-win-v0.2.1.exe
    sha512: xxxx...
    size: 98765432
path: cuckoo-code-win-v0.2.1.exe
sha512: xxxx...
releaseDate: '2026-08-28T12:00:00.000Z'
```

### 1.3 更新流程

```
应用启动
  ↓
延迟 5 秒（避免影响启动速度）
  ↓
autoUpdater.checkForUpdates()
  ↓
请求 latest.yml
  ↓
版本比较
  ├── 远端更新 → 自动下载 → 下载完成弹窗询问 → 用户确认重启安装
  └── 已是最新 → 静默结束
```

### 1.4 错误处理策略

- **自动检查失败**：静默显示系统通知，不弹对话框打扰用户
- **手动检查失败**：弹出对话框，明确提示"更新服务器位于 GitHub，可能需要代理/VPN"
- **网络错误分类**：识别 DNS 失败、连接超时、证书问题、GitHub 403/404 等，给出针对性提示
- **提供重试按钮**：用户点击后重新检查

---

## 二、发布流程（每一步的原因）

### 第 1 步：确认代码已提交

```bat
git status
```

**为什么**：
如果工作目录有未提交改动就发布，新版本可能缺少功能代码（比如自动更新逻辑），
导致用户安装后无法接收后续更新。发布前必须确保所有改动已提交。

---

### 第 2 步：运行 release.bat

```bat
release.bat
```

脚本会提示输入新版本号（如 0.2.0 → 0.2.1）。

**为什么用脚本而不是手动操作**：
release.bat 自动完成以下工作，避免手动遗漏：

1. 更新 `package.json` 和 `package-lock.json` 的版本号
   - **原因**：版本号必须递增，electron-updater 才能判断有新版本
2. git commit（提交版本号改动）
   - **原因**：保持代码仓库与发布版本一致
3. git push 到 GitHub master 分支
   - **原因**：让 GitHub Actions 能拉取到最新代码
4. 创建并推送 tag `v{版本}`
   - **原因**：GitHub Actions 的 release.yml 监听 tag push 事件，tag 是触发构建的信号

---

### 第 3 步：等待 GitHub Actions 完成

构建进度：https://github.com/wangyongpeng90/cuckoo-code/actions

**为什么用 CI 而不是本地打包**：
- GitHub Actions 的 macos-latest 是 arm64（Apple Silicon），windows-latest 是 x64
- 需要在 macOS 上构建 macOS 包，在 Windows 上构建 Windows 包
- 本地 Windows 无法构建 macOS 包（除非交叉编译，但不可靠）
- CI 自动注入 `GH_TOKEN`，electron-builder 可自动创建 Release 并上传

**为什么 max-parallel: 1（串行执行）**：
Windows 和 macOS 两个 job 都要向同一个 GitHub Release 上传文件，
并行执行会导致两个 job 各自创建 Release，产生冲突。串行确保先创建的 Release 被后执行的 job 更新追加。

---

### 第 4 步：验证 Release 内容

访问 https://github.com/wangyongpeng90/cuckoo-code/releases

确认以下文件存在：

**Windows**：
- `cuckoo-code-win-v{版本}.exe`
- `cuckoo-code-win-v{版本}.exe.blockmap`
- `latest.yml` ← 没有它自动更新失效

**macOS**（双架构）：
- `cuckoo-code-mac-v{版本}-x64.dmg`
- `cuckoo-code-mac-v{版本}-arm64.dmg`
- `cuckoo-code-mac-v{版本}-x64.zip`
- `cuckoo-code-mac-v{版本}-arm64.zip`
- `latest-mac.yml` ← 没有它 macOS 自动更新失效

**为什么必须检查 latest.yml**：
这是自动更新的"大脑"，缺少它用户永远收不到更新通知。
历史上很多项目自动更新失效，原因都是构建产物没上传 latest.yml。

---

### 第 5 步：测试自动更新（可选但强烈推荐）

1. 安装旧版本（如 0.2.0）
2. 启动应用，等待约 5 秒
3. 或点击菜单 **帮助 → 检查更新**
4. 应检测到新版本并自动下载

**为什么推荐测试**：
自动更新是用户侧功能，只有真实安装旧版本才能验证完整流程。
否则可能出现"Release 有文件但用户收不到更新"的隐蔽 bug。

---

## 三、版本号规则

### 3.1 必须递增

| 当前版本 | 新版本 | 是否更新 |
|---|---|---|
| 0.2.0 | 0.2.1 | ✅ |
| 0.2.0 | 0.3.0 | ✅ |
| 0.2.0 | 0.2.0 | ❌ 同版本不更新 |
| 0.2.0 | 0.1.9 | ❌ 远端更旧不更新 |
| 0.2.0 | 0.2.0-beta.1 | ❌ prerelease 默认忽略 |

### 3.2 格式要求

必须是 semver 格式 `x.y.z`（纯数字），如 0.2.1、1.0.0。

---

## 四、本地构建命令

### 4.1 不发布（开发测试用）

```bash
npm run build:local              # 构建当前平台
npm run build:win:local           # 构建 Windows（nsis + portable）
npm run build:mac:local           # 构建 macOS 双架构
npm run build:win:nsis:local      # 仅构建 Windows NSIS
npm run build:win:portable:local  # 仅构建 Windows portable
npm run build:mac:dmg:local       # 仅构建 macOS DMG
```

**为什么用 :local 后缀**：
`--publish never` 不会尝试上传到 GitHub，适合本地测试。
不带 :local 的命令是 `--publish always`，在 CI 中通过 GH_TOKEN 自动发布。

### 4.2 发布（CI 专用）

```bash
npm run build:win   # Windows 自动发布
npm run build:mac   # macOS 自动发布
```

**注意**：本地执行这些命令会因缺少 GH_TOKEN 而在最后上传时报错（但产物文件已生成）。
如需本地构建产物但不想发布，请使用 :local 命令。

---

## 五、macOS 双架构说明

### 5.1 为什么需要双架构

- Intel Mac（2019 及以前）：x64
- Apple Silicon Mac（M1/M2/M3/M4）：arm64

只构建单一架构，另一类用户无法运行。
之前只发布单一架构，导致部分用户（如朋友的 M 系列 Mac）无法使用。

### 5.2 当前配置

```json
"mac": {
  "target": [
    { "target": "dmg", "arch": ["x64", "arm64"] },
    { "target": "zip", "arch": ["x64", "arm64"] }
  ],
  "artifactName": "cuckoo-code-mac-v${version}-${arch}.${ext}"
}
```

每次发布会生成 4 个 mac 文件，文件名带架构标识，避免覆盖冲突。

---

## 六、首次发布的"冷启动"问题

### 6.1 现象

0.2.0 版本用户不会收到 0.2.1 的更新提示。

### 6.2 原因

0.2.0 版本里没有自动更新代码（updater.js、electron-updater 依赖等），
自然无法检查更新。

### 6.3 解决方案

在 0.2.1 的 Release Notes 中提醒 0.2.0 用户手动下载安装：

> 本次更新包含自动更新功能。0.2.0 用户请手动下载安装本版本，
> 之后即可自动接收后续更新。

这是 Electron 自动更新的一次性"冷启动"问题，无法避免。

---

## 七、故障排查

### 7.1 GitHub Actions 失败

- **GH_TOKEN 权限不足**：仓库 Settings → Actions → Workflow permissions → 勾选 Read and write permissions
- **npm ci 失败**：本地执行 `npm install` 更新 package-lock.json 后提交
- **构建超时**：双架构 mac 构建较慢，偶尔超时，重跑 job 即可

### 7.2 用户收不到更新

- **检查 latest.yml 是否在 Release 中**：缺失则自动更新完全失效
- **检查版本号是否递增**：远端版本 ≤ 本地版本不会更新
- **检查用户网络**：GitHub 在国内可能无法直连，错误提示会明确告知

### 7.3 本地测试更新

- 本地启动应用默认跳过更新检查（开发环境）
- 如需本地测试，需设置 `CUCKOO_TEST_UPDATE=1` 环境变量（需在 updater.js 中添加对应逻辑）
- 或直接打包安装旧版本测试真实流程

---


## 七之补充、测试版（beta）发布方案

### 适用场景

- 想发布一个「测试版」给少数用户验证功能
- 不想让测试版进入自动更新体系（避免正式版用户误更新或 latest.yml 被覆盖）

### 核心原则

- **测试版完全隔离在自动更新体系之外**
- 测试版**不打 tag 推送**（否则 CI 会触发构建并覆盖 latest.yml）
- 测试版靠**手动下载安装**
- 只有正式版才更新 latest.yml，触发自动更新

### 发布步骤

#### 第 1 步：本地修改版本号

```bash
# 手工修改 package.json 和 package-lock.json 的 version
# 例如：0.2.4 → 0.2.5-beta.1
```

**为什么不用 npm version**：npm version 会自动打 tag，而 tag 会触发 CI 构建。

#### 第 2 步：本地构建

```bash
npm run build:win:local
# 或
npm run build:win:nsis:local
```

**为什么用 :local**：--publish never，不会上传到 GitHub、不会碰 latest.yml。

#### 第 3 步：手动创建 GitHub Release

1. 打开 https://github.com/wangyongpeng90/cuckoo-code/releases
2. 点击「Draft a new release」
3. Tag 选择或新建：v0.2.5-beta.1
4. **勾选「Set as a pre-release」**
5. 上传 dist/ 里的 .exe 安装包
6. **不要上传 latest.yml**（这是关键！）

**为什么手动创建而不是推 tag**：
- 推 tag 会触发 CI（监听 v*），CI 会构建并自动覆盖 latest.yml
- 手动创建 Release 可以控制上传内容，避免污染自动更新

#### 第 4 步：通知测试用户

让测试用户手动下载安装包，提供 Release 链接。

#### 第 5 步：未来转正式版

测试验证通过后：

1. 版本号改为正式版（去掉 -beta 后缀）：0.2.5-beta.1 → 0.2.5
2. 提交并推送
3. 走正式 release.bat 流程（CI 自动构建 + 更新 latest.yml）
4. 正式版用户自动更新恢复

### 注意事项

- **beta tag 不要推送**：推了就会触发 CI，CI 的 sync-version.js 会把 package.json 版本同步成 beta 版本，构建产物也带 beta 后缀，latest.yml 被覆盖
- **正式版用户不会更新到 beta**：electron-updater 默认 allowPrerelease=false，正式版用户点检查更新会忽略 prerelease 版本
- **但 latest.yml 被 beta 覆盖后**：正式版用户会暂时检测不到下一个正式版，直到正式版重新覆盖 latest.yml
- **如果想多个 beta 迭代**：依次用 -beta.1、-beta.2……，每次手动 Release，不打 tag

---
## 八、相关文件清单

| 文件 | 作用 |
|---|---|
| `src/main/updater.js` | 自动更新核心逻辑（253 行） |
| `src/main/index.js` | 集成菜单和启动检查 |
| `package.json` | build.publish 配置 + 双架构 + 构建脚本 |
| `.github/workflows/release.yml` | CI 自动构建发布 |
| `release.bat` | 一键发布脚本（更新版本号+推送） |
| `latest.yml` | Windows 更新元数据（构建产物） |
| `latest-mac.yml` | macOS 更新元数据（构建产物） |
```
