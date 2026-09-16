# 当前版本问题盘点进度

- [complete] 读取项目规范、计划与当前文件清单
- [complete] 检查源码实现与边界条件
- [complete] 检查测试覆盖、资源质量和发布产物
- [complete] 汇总七个维度的问题与下一版本 Top 3–5

## 验证结果

- `npm test`: 46/46 通过。
- `node --check`：`src/*.js` 全部通过。
- 依赖离线高危审计：0 项高危/严重漏洞报告。
- 本地资源 contact sheet 已视觉检查；未完成真实 Electron 窗口截图，因为当前 CUA 原生应用入口不可用。

## 2026-09-16 项目迁移检查

- [complete] 将当前完整项目复制到 `D:\petpet派派桌宠管理器`，包含 Git、资源、依赖、未提交改动和团队配置。
- [complete] 源/目标均为 3371 个文件、总大小一致，关键文件哈希一致。
- [complete] D 盘副本自动测试 58/58 通过。
- [blocked] C 盘原目录被 Codex 进程占用，暂未能改成指向 D 盘的目录联接；C 盘原项目未删除，团队协作路径当前仍安全。

## 2026-09-16 运行时能力报告接入

- [complete] 新增运行时能力报告适配：消费 `src/pet-package.js` 校验报告，兼容 interaction、light-care、full-care 三种状态。
- [complete] 按 `care.actionMap` 选择标准动作；缺少已校验的专属互动资源时回退图集动作。
- [complete] 主进程向桌宠运行时传递 `runtimeCapabilities`，渲染进程按报告执行互动播放计划。
- [complete] 新增运行时接口测试，覆盖能力模式、动作映射、专属资源优先级和安全回退。

## 本轮验证

- `npm test`: 62/62 通过。
- `node --check src/pet-runtime.js src/main.js src/renderer.js`: 通过。
- `git diff --check`: 通过。
- 未修改 `src/pet-package.js`、管理器 UI 或 `assets/` 美术资源。

## 2026-09-16 运行时 QA 修复

- [complete] 定位自动演示根因：轻养成每秒推送相同 `care-state`，renderer 每次都清除并重置 9 秒定时器。
- [complete] 修复为仅在 care 状态变化或初始化时重新调度，避免计时器被周期状态消息饿死。
- [complete] 关闭鼠标跟随时同步重置播放器 `pointerDirection`，一次性动作结束不会回到旧方向。
- [complete] interaction 模式的“休息”增加运行时休息抑制，停止自动演示；普通互动可恢复演示。
- [complete] 新增播放策略和播放器方向回归测试。

## 本轮验证

- `npm test`: 66/66 通过。
- `node --check src/playback-policy.js src/pet-player.js src/renderer.js`: 通过。
- `git diff --check`: 通过。
- CSP 警告未处理；本轮保持在 QA 指定的运行时范围内。

## 2026-09-16 一次性动作结束状态修复

- [complete] 定位根因：播放器没有保存鼠标跟随开关，动作结束逻辑无条件切换到 `look` 并恢复 `pointerDirection`。
- [complete] 跟随开启时，一次性动作结束后恢复当前注视方向。
- [complete] 跟随关闭时清空 `pointerDirection`，一次性动作结束后进入持续循环的 `idle` 动作。
- [complete] 新增两种跟随模式的 RAF 播放器回归测试。

## 本轮验证

- `npm test`: 68/68 通过。
- `manager-renderer.js` 与 `src/*.js` 逐文件 `node --check`: 全部通过。
- `git diff --check`: 通过。
- 未修改管理器 UI、桌宠包校验器或美术资源。

## 2026-09-16 关闭鼠标跟随后立即进入 idle

- [complete] 按 QA 根因假设补充播放器回归测试：关闭跟随后立即断言 `action/idle` 状态。
- [complete] 修复 `setPointerFollowing(false)`：清空方向并立即切换到循环 idle 动作。
- [complete] 保持跟随开启时一次性动作结束恢复当前注视方向的行为。

## 本轮验证

- `npm test`: 69/69 通过。
- `manager-renderer.js` 与 `src/*.js` 逐文件 `node --check`: 全部通过。
- `git diff --check`: 通过。
- 未修改管理器 UI、桌宠包校验器或美术资源。

## 待 UI 优化

- [todo] 文件夹导入入口目前折叠在右上角“更多”按钮中，主按钮“导入桌宠”实际只打开 ZIP 文件选择器；用户容易误以为无法导入文件夹。建议 UI 将“导入文件夹”作为明确可见的独立入口，或在“更多”菜单中明确展示该文字。

## QA 补充

- 用户实测除睡眠自动播放外其余项目均正常。
- 睡眠自动播放尚未完成真实手工验证：轻养成模式下 10 分钟进入犯困，20 分钟无互动后进入睡眠；可直接点击“休息”立即进入睡眠状态，再确认自动演示和键盘动作均被阻止。

## QA 新发现

- [reported][S2] `interaction` 模式桌宠（当前 `examples/sample-pet`）点击“休息”后仍会继续自动演示：该模式的 care model 保持 `awake`，渲染器不会清除已有的自动演示定时器。建议 UI 对即时互动桌宠隐藏或改名“休息”按钮；若保留该按钮，运行时应明确将其解释为暂停自动演示并在结束后恢复。
- 软团团点击“休息”后不再播放其他动作与当前 `light-care` 睡眠逻辑一致；点击前未观察到自动动作可能是尚未达到 9 秒自动演示间隔或自动演示开关状态导致，不能据此判定为缺陷。
- 复测说明：软团团点击“休息”后会在当前运行会话保持 `sleeping`，即使“自动演示”开关开启也不会自动播放；点击“摸摸”或其他非休息互动唤醒后再复测。
- [reported][S3] 用户确认：关闭鼠标跟随后，手动播放动作不应在结束时固定到某个旧方向；当前只调用 `setDirection('000')`，未同步清空播放器的 `pointerDirection`，可能恢复到关闭跟随前的旧方向。建议运行时在关闭跟随时同步重置指针方向。
- [needs-repro] 用户唤醒软团团后确认“自动演示”已开启，但仍未观察到自动动作；需在全新启动、确认状态为“准备好陪你”后等待完整 9 秒演示间隔复测，再判断是否为自动演示定时器问题。
- [blocked][S1] 带 Electron 日志启动时出现 `Renderer process launch-failed`；同时 `AppData\\Roaming\\派派桌宠管理器\\Cache`、`Network` 等目录报告拒绝访问。主进程窗口可出现，但渲染进程未正常启动会导致自动演示和手动动作均无效。需关闭残留实例后使用独立可写 `--user-data-dir` 复测，以区分本机用户数据目录权限/占用问题与应用代码问题。
- [blocked][S1] 使用独立可写 `--user-data-dir` 后不再出现 `Renderer process launch-failed`，但用户仍无法观察到自动演示；PowerShell 仅有 Electron CSP 安全警告。需在可查看渲染进程控制台的环境中继续定位自动演示定时器/播放器状态。

## 2026-09-16 Renderer process launch-failed 调查

- [complete] 在独立可写用户数据目录下复现当前项目的 `Renderer process launch-failed`。
- [complete] 对比最小 Electron 页面、同一 preload、index/manager 页面、GPU 参数和 sandbox 选项，确认直接根因是 sandboxed renderer 在本机 Windows 环境启动失败。
- [complete] 记录 renderer `reason=launch-failed, exitCode=49`、`ERR_FAILED (-2)`、GPU `0xC0000135` 和非致命 `os_crypt` 日志。
- [in_progress] 先补充 sandbox 选项回归测试，再对三个 BrowserWindow 使用最小范围修复。

- [complete] 新增 `src/electron-window-options.js`，统一为桌宠、管理器和预览窗口显式设置 `sandbox: false`，保留 `contextIsolation: true`、`nodeIntegration: false` 和受限 preload IPC。
- [complete] 增加主进程 renderer/preload/console/load/child-process 诊断日志，便于后续区分 launch、GPU 和页面错误。
- [complete] 独立可写 `--user-data-dir` 修复后启动冒烟通过；未传额外 `--no-sandbox`，未出现 `Renderer process launch-failed`、`reason=launch-failed` 或 `load error`。
- [complete] 已移除临时 `artifacts/renderer-diagnosis/main.js`。

## Renderer 修复验证

- 修复前：独立目录启动出现 4 次 `Renderer process launch-failed`；诊断事件为 `reason=launch-failed, exitCode=49`，`loadFile` 为 `ERR_FAILED (-2)`。
- 修复后：独立目录启动 `launchFailed=false`；无 renderer launch/load 失败日志。仍有非阻断 Electron CSP 警告、独立临时目录下的 `os_crypt` 加密警告和 `VizNullHypothesis` 信息。
- Windows 事件日志最近 2 小时未发现 Electron、Chromium 或 Application Error 相关崩溃记录；环境为 Windows 10.0.26200、AMD64/x64、Electron 44.3.0。

## 2026-09-16 QA 回归：Renderer 修复交付

- [complete] D 盘 `npm test`: 70/70 通过。
- [complete] 逐文件 `node --check`: 40 个项目 JavaScript 文件通过，排除 `node_modules`、`release`、`dist`。
- [complete] `git diff --check`: 无错误，仅有 LF/CRLF 换行提示。
- [complete] 当前源代码使用 Electron 44.3.0、Windows NT 10.0.26200.0、x64；三个 BrowserWindow 均接入 `sandbox: false`、`contextIsolation: true`、`nodeIntegration: false` 和受限 preload。
- [complete] 使用全新独立目录 `D:\petpet派派桌宠管理器\.qa-user-data-20260916` 启动，未传 `--no-sandbox`；日志加载了桌宠、管理器页面及其脚本/资源，未出现 `Renderer process launch-failed`、`reason=launch-failed`、`preload error`、`ERR_FAILED` 或 level=3 控制台错误。
- [complete] 仅观察到非阻断的 Electron CSP 警告、`os_crypt` 环境警告和 Chromium 信息日志；最近两小时 Windows Application 事件日志未发现 Electron/Chromium/Application Error 相关事件。
- [blocked] 现有 `release\派派桌宠管理器-win32-x64` 产物时间为 2026-09-14，早于本次修复；直接启动该旧便携包仍出现 `Renderer process launch-failed`，不能作为修复后的便携版验收证据。
- [not verified] 当前环境无法自动操作原生 Electron 窗口，因此管理器按钮、桌宠互动、预览窗口实际 UI/IPC、退出方式和真实自动演示未完成端到端验证。

## 2026-09-16 新便携版回归

- [complete] 新便携版 `release\派派桌宠管理器-win32-x64` 的 EXE 与 `resources\app.asar` 均为 2026-09-16 16:03:03；asar 共 284 项，当前运行所需文件存在，未发现测试、QA 临时文件或运行时缓存被打包进去。
- [complete] 使用全新可写目录 `D:\petpet派派桌宠管理器\.qa-portable-user-data-20260916-final` 启动新 EXE，未传入 `--no-sandbox`；观察期间未出现 `Renderer process launch-failed`、`reason=launch-failed`、preload 错误或 `ERR_FAILED`。
- [complete] 新便携版日志仅有非阻断的 `os_crypt` 环境警告、Chromium 信息日志和 `fs.Stats` 弃用提示；最近两小时 Windows Application 事件日志未发现 Electron、Chromium 或 Application Error 匹配项；`npm test` 复跑为 70/70，通过逐文件语法检查和 `git diff --check`。
- [not verified] 当前环境无法自动操作原生 Electron 窗口，因此管理器、桌宠、预览窗口的可见状态、按钮 IPC、互动、退出和视觉自动演示仍需用户手工确认。
- [blocked] 在限定观察时间内进程保持常驻，未观察到自然退出；退出方式和退出后的日志仍未完成验证。

## 2026-09-16 手工冒烟尝试：新便携版

- [not verified] 1. 管理器窗口：无法由当前桌面自动化接口取得原生 Electron 窗口并截图确认。
- [not verified] 2. 桌宠窗口：无法进行原生窗口可见状态确认；日志侧确认加载了 `soft-blob/spritesheet.webp`。
- [not verified] 3. 预览窗口：本次无法点击管理器打开预览窗口。
- [not verified] 4. 管理器按钮：本次无法点击并验证按钮 IPC。
- [not verified] 5. 手动动作后的方向连续性：本次无法操作桌宠确认。
- [not verified] 6. 鼠标跟随开关：本次无法操作开关确认。
- [not verified] 7. 自动演示：本次无法勾选并观察视觉播放。
- [not verified] 8. 休息行为：本次无法点击并观察。
- [not verified] 9. 正常关闭管理器和桌宠：未执行正常 UI 关闭；测试进程由测试环境结束，不能作为正常退出证据。
- [not verified] 10. 退出后错误：测试期间日志未出现 `Renderer process launch-failed`、`preload error` 或 `ERR_FAILED`，但因未完成正常 UI 退出，本项整体仍记为未验证。
- [complete] 新便携版使用独立目录启动并保持响应；测试结束后已结束本次测试实例，未把该实例留在后台。

## 2026-09-16 用户手工 UI 冒烟：启动层回归

- [not verified] 1. 管理器窗口视觉显示：原生窗口接口不可用，未取得截图；仅确认进程响应且存在窗口句柄。
- [not verified] 2. 桌宠窗口视觉显示：未取得原生窗口截图；日志确认加载 `soft-blob/spritesheet.webp`。
- [not verified] 3. 预览窗口：未能执行 UI 点击打开预览。
- [not verified] 4. 管理器按钮：未能执行按钮点击和 IPC 验证。
- [not verified] 5. 手动播放后的方向连续性：未能操作验证。
- [not verified] 6. 鼠标跟随开关：未能操作验证。
- [not verified] 7. 自动演示：未能勾选并观察验证。
- [not verified] 8. 休息行为：未能点击并观察验证。
- [not verified] 9. 应用自身正常关闭：未能执行 UI 关闭；测试实例由测试环境结束。
- [not verified] 10. 正常退出后的错误：启动及结束前日志均未发现 `Renderer process launch-failed`、`preload error` 或 `ERR_FAILED`，但未完成正常 UI 退出，整体仍记为未验证。
- [complete] 新便携版启动层：使用独立目录启动 8 秒，进程响应、窗口句柄存在，`launchFailed=false`、`preloadError=false`、`errFailed=false`；测试实例已停止。

## 2026-09-16 release-final 手工 UI 冒烟尝试

- [not verified] 1. 管理器窗口正常显示：当前原生窗口接口不可用；启动实例只返回一个带窗口句柄、标题为“软团团 · 派派”的窗口，不能据此证明管理器窗口可见。
- [not verified] 2. 桌宠窗口正常显示：进程/窗口层确认桌宠窗口句柄存在且响应，日志确认加载 `release-final\...\pets\soft-blob\spritesheet.webp`；未取得视觉截图，因此 UI 整体仍未验证。
- [not verified] 3. 管理器中打开动作预览：无法执行管理器内点击，未验证。
- [not verified] 4. 运行桌宠、隐藏桌宠、动作预览、摸摸、喂零食、一起玩、休息：无法执行按钮点击，未验证。
- [complete] 5. 启动期间未发现 `Renderer process launch-failed`、`reason=launch-failed`、`preload error` 或 `ERR_FAILED`；此项仅完成日志层验证。
- [not verified] 6. 通过应用自身正常关闭管理器和桌宠：未能执行 UI 关闭；测试实例及其同批子进程已由测试环境结束，不能作为正常退出证据。
- [blocked] 本轮 release-final 的原生 UI、动作交互、预览和正常退出未完成验证，发布暂不能仅凭本轮结果放行；需用户手工确认或提供可操作原生窗口环境。
- [complete] 本轮使用全新可写目录 `.qa-release-final-20260916` 启动；未修改功能逻辑。

## 调查环境错误

| 错误 | 处理 |
|---|---|
| `python` 命令不存在，无法执行 planning-with-files 的 session metadata 脚本 | 改用 PowerShell 读取现有计划和记录；不影响项目验证 |
| `Get-CimInstance Win32_Process` 返回“拒绝访问” | 改用显式启动的 Electron 进程、stdout/stderr 和 Electron child-process 日志 |

## 2026-09-16 最终发布准备

- [complete] 核对 `package.json` 与 `package-lock.json` 版本均为 `1.0.0`。
- [complete] 保留原 `release\\派派桌宠管理器-win32-x64` 目录及其中 QA 运行态数据，未删除原有产物或用户数据。
- [complete] 生成独立干净交付目录：`release-final-delivery\\派派桌宠管理器-win32-x64`。
- [complete] 交付目录包含 73 个文件、2 个目录；未发现测试目录、QA 临时目录、缓存、运行态文件或开发计划文件。
- [complete] 核对 EXE、`resources\\app.asar`、应用图标和软团团资源；app.asar 共 270 个条目，必需资源存在。
- [complete] 最终排除 `Microsoft\\Spelling` 环境残留后保留 QA 通过包，并复制出白名单交付包；最终 `app.asar` 共 270 个条目，必需资源存在。
- [complete] 新增用户启动/导入说明、更新日志、发布记录和中文文案审核表；同步修正 README、文字版说明和 HTML 说明中的 EXE 与文件夹名称。
- [complete] 用户已确认最终候选包的原生窗口 UI、按钮 IPC、桌宠互动、自动演示、预览窗口和正常退出均通过。
- [complete] QA 手工验收阻断已解除，可以进入最终发布交付。
- [complete] 从 QA 通过的 `release-final` 白名单复制出 `release-final-delivery`；EXE 与 app.asar 哈希一致，交付目录不含 QA 运行态数据。
