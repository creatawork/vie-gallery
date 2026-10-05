# 照片配置特效与性能升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已有照片展示配置升级为可细调、风格可辨、资源有预算的开源展示能力，并用配置生命周期与真实浏览器证据验收。

**Architecture:** 在 gallery-contracts 中统一配置和预设；Viewer 分离创作配置与有效画质，集中管理动画时间、后处理和照片资源。管理端使用同一配置规范化流程，经现有草稿、发布、回滚 API 和可信 iframe 消息下发。沿用 Vue 3、Three.js 插件体系，不引入另一套渲染引擎。

**Tech Stack:** Vue 3、TypeScript、Three.js 0.169、Vite 5、Node.js 18+、Java 17、Spring Boot 3.3.5、JUnit 5、Playwright；Node 内置 test runner 配合 esbuild 编译 TS 测试。

**Spec:** [已批准设计](../specs/2026-10-05-viewer-effects-performance-design.md)。用户于 2026-10-05 在对话中批准设计；本计划待审阅和选择执行方式。

## Global Constraints

- 定位：开源项目，全部场景和特效开放，不引入收费、订阅或权益判断。
- 继续使用现有 `configJson` 和 schemaVersion=1，本次字段均为可选扩展；不改变已有字段含义，不批量改写数据库历史快照。
- 配置 JSON 限制为 UTF-8 64 KiB，嵌套深度最多 8。
- density=0 不生成粒子；不能使用 `density || 1`。
- 入场动画使用时间调度表代替每张照片 setTimeout；总交错延迟不超过 1 秒。
- 保留活动 60 FPS、空闲 20 FPS 的调度基础。
- 连续 3 个窗口 FPS < 30 降一级，连续 8 个窗口 FPS >= 55 可升一级；每次调整冷却 10 秒。
- low 持续低于 20 FPS 5 秒则回退 2D；加载、转场、空闲、隐藏和 WebGL 丢失不计入性能判定。
- 性能降级不得修改 requestedConfig，不得触发草稿自动保存。
- 预算：low 为 DPR 1 / 512px / 32 MiB / 并发 2 / 驻留 32 / 粒子 200 / 后处理比例 0.5；mid 为 1.5 / 1024px / 64 MiB / 3 / 64 / 700 / 0.75；high 为 2 / 2048px / 128 MiB / 4 / 96 / 1600 / 1。
- 桌面 50 张 mid 中位 FPS >= 50、帧间隔 p95 <= 33ms；真实移动 50 张 low 中位 FPS >= 30、p95 <= 50ms。
- 200/500 张不超预算、不重建已有纹理，不出现单次 >200ms 的同步脚本长任务。
- 连续 20 次场景切换和 10 次 2D/3D 切换后，稳定资源增长不超过 10% 或 2 个资源（取较大值）。
- 同机同画质场景的 CPU update+render p95 开销不劣化超过 10%；无真实移动设备时标记“未验证”。
- 不新增体积光、实时反射、景深、音乐系统；2D、灯箱和下载资源不套用 3D 调色。
- 提交作者按 CONTRIBUTING.md 使用 creatawork / 113406486+creatawork@users.noreply.github.com；只暂存当前任务文件，保留已有未跟踪截图。

## Review Focus

1. 老测试及数据可能把 `layout` 写成字符串；应作为受支持的旧格式转换，不能新增校验后让原有发布回滚全部失效（任务 1、2）。
2. 图片已开始下载时切到 2D，再返回 3D；旧实例的完成回调必须释放纹理，不可回写新场景（任务 7）。
3. 拖滑块时相册切换、iframe 重连或配置请求乱序；最后一次有效配置获胜，旧窗口消息无效（任务 5、9）。
4. 相机快速往返移动使驻留纹理反复换入；始终守预算，并避免重复网络下载、饥饿及缓存越界（任务 7、8）。
5. 密码相册解锁或访问凭证过期；有效配置在解锁后重新读取，过期不继续沿用可能过时的下载权限（任务 9、10）。

每一项均在对应任务加入行为测试，不以接口成功、控件存在或截图文件存在代替结果。

## 文件职责与执行约定

以下路径相对仓库根目录 `E:\workspace\vie-gallery`。

| 单元 | 文件 | 职责 |
| --- | --- | --- |
| 契约 | `packages/gallery-contracts/src/viewerConfig.ts` | 类型、字段规则、默认值、验证/规范化/序列化 |
| 兼容 | `packages/gallery-contracts/src/viewerConfigLegacy.ts` | 冻结旧预设和旧字段转换，不导入 Viewer |
| 预设 | `packages/gallery-contracts/src/viewerPresets.ts` | 八个完整新场景、应用和恢复默认 |
| 配置夹具 | `packages/gallery-contracts/fixtures/viewer-config-cases.json` | TS/Java 共用输入、合法性和错误路径 |
| 单元测试入口 | `scripts/test-viewer-unit.mjs` | 编译指定 TS 测试，再使用 node --test 执行 |
| 后端验证 | application 下 `ViewerConfigValidator.java` | JSON 结构、大小/深度和已知字段验证 |
| 动画时间 | `apps/gallery-viewer/src/core/FrameClock.ts` | 活动 elapsed 和 delta，隐藏/恢复校准 |
| 后处理 | `apps/gallery-viewer/src/core/PostProcessing.ts` | 唯一 composer、pass、resize、DPR、释放 |
| 照片资源 | `apps/gallery-viewer/src/core/PhotoScene.ts`、`TexturePool.ts` | Mesh 增量与按预算纹理加载/回收 |
| 质量策略 | `apps/gallery-viewer/src/core/QualityController.ts` | 质量预算、迟滞、冷却、回退决策 |
| 工作台状态 | `apps/gallery-admin/src/composables/useViewerConfigEditor.ts` | 完整配置编辑、校验、保存、场景应用 |
| 配置控件 | `components/gallery-config/*.vue` | 分组控件，向编辑器发送变化 |
| 预览协议 | `apps/gallery-admin/src/lib/viewerPreviewChannel.ts` | 来源校验、序号、握手和状态 |
| 验收 | `apps/gallery-viewer/e2e/*.spec.ts`、`docs/viewer-effects-performance-acceptance.md` | 功能、资源、视觉和真实性能证据 |

每项先写失败测试、观察实际失败，再实现并验证。禁止先写生产实现再把测试补成通过。每项提交前检查 staged diff 和独立验证；红灯先修复当前任务，不开始下一项。测试代码中的新接口由该任务定义；小片段为关键实现，不表示可以省略设计中同组字段的规则。

任务依赖：1 → 2/3；1/3 → 4；1/4 → 5；3/5 → 6；5 → 7；4/6/7 → 8；1/3/5/8 → 9；全部 → 10。按编号执行即可；本计划不要求并行写同一引擎。

## Task 1: 共享配置、旧格式与可执行测试夹具

**Files:** Create 契约表中的 viewerConfig.ts、viewerConfigLegacy.ts、fixtures、`packages/gallery-contracts/test/viewerConfig.test.ts`、`scripts/test-viewer-unit.mjs`；Modify `packages/gallery-contracts/src/index.ts`、根 `package.json`、`package-lock.json`。

**Interfaces:**

```ts
export interface ConfigIssue { path: string; message: string }
export interface ConfigResult { config: ViewerConfig; issues: ConfigIssue[] }
export function normalizeViewerConfig(input: unknown, mode: 'strict' | 'legacy'): ConfigResult
export function parseViewerConfig(json: string, schemaVersion?: number, mode?: 'strict' | 'legacy'): ConfigResult
export function serializeViewerConfig(config: ViewerConfig): string
export function mergeViewerConfig(base: ViewerConfig, patch: unknown): ViewerConfig
export function migrateLegacyConfig(input: Record<string, unknown>): Record<string, unknown>
```

`ViewerConfig` 包含设计 4.2 的全部字段与 visitorAllowDownload；规范化后所需嵌套组均存在。未知扩展使用 JSON 值类型，不用 any。规则表导出 `VIEWER_CONFIG_RULES`：路径、kind、枚举或 min/max，夹具及 Java 同步按此表核对。

同时定义 `ParticleType` 六个名称与 `ViewerQuality = 'low' | 'mid' | 'high'`；类型 quality 字段允许额外 'auto'。定义 `ViewerConfigValidationError extends Error`，构造参数为 `ConfigIssue[]`，message 为首个字段错误。旧有 bloom/fog 边界也写入规则：strength 0–2、radius/threshold 0–1、fog density 0–0.01；未在设计表中缩窄的历史值不得无证据重新限制。

- [ ] **Step 1:** 为本任务引入单元测试命令 `test:viewer:unit`。直接声明当前工具链已使用的 esbuild 0.21.5 为根 devDependency，避免依赖 npm 偶然提升；使用 `npm install --save-dev --save-exact esbuild@0.21.5`。脚本接受一个或多个测试路径，未传时递归枚举 contracts/test 与 viewer/test 下的 `.test.ts`，不执行截图脚本。

```js
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { readdir } from 'node:fs/promises'
async function discover(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...await discover(file))
    else if (file.endsWith('.test.ts')) result.push(file)
  }
  return result
}
const selected = process.argv.slice(2)
const files = selected.length ? selected : [
  ...await discover('packages/gallery-contracts/test'),
  ...await discover('apps/gallery-viewer/test')
]
const outputs = []
await mkdir('.cache/viewer-unit', { recursive: true })
for (const [index, file] of files.entries()) {
  const outfile = path.resolve('.cache/viewer-unit', `${index}.test.mjs`)
  await build({ entryPoints: [file], outfile, bundle: true, platform: 'node',
    format: 'esm', target: 'node18',
    external: ['three', 'three/*', 'vue', 'node:*'], sourcemap: 'inline' })
  outputs.push(outfile)
}
if (!outputs.length) throw new Error('No test files selected')
const result = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
```

共享 TS 包被打包而不是作为外部 TS 入口交给 Node，Node 18 不需要加载 TS。脚本从仓库根目录执行；递归枚举、输出路径和子进程失败应包含在脚本测试内。

- [ ] **Step 2:** 添加下面的测试，并循环读取同一 fixtures 文件测试每项是否合法、错误路径和 legacy 转换。覆盖所有参数边界，危险键、超深、64 KiB UTF-8 字符、字段 null/数组、schemaVersion=99、非有限数字（函数输入）、density=0、未知扩展保存和空配置。

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseViewerConfig, serializeViewerConfig } from '../src/viewerConfig'
test('legacy layout string survives round trip', () => {
  const first = parseViewerConfig('{"layout":"helix","extension":{"label":"x"}}', 1, 'legacy')
  assert.equal(first.config.layout.mode, 'helix')
  const extension = first.config.extension
  assert.ok(extension && typeof extension === 'object' && !Array.isArray(extension))
  assert.equal((extension as Record<string, unknown>).label, 'x')
  const next = parseViewerConfig(serializeViewerConfig(first.config), 1, 'strict')
  assert.equal(next.issues.length, 0)
  assert.deepEqual(next.config, first.config)
})
test('density zero is retained and invalid density is reported', () => {
  assert.equal(parseViewerConfig('{"particles":{"density":0}}').config.particles.density, 0)
  assert.equal(parseViewerConfig('{"particles":{"density":3}}').issues[0].path, 'particles.density')
})
```

未知扩展保留在原 JSON 路径，ViewerConfig 类型采用已知字段与 `Record<string, unknown>` 交叉类型；规范化函数保证扩展值只包含安全 JSON 值。读取扩展时先窄化类型，不加 ts-ignore。夹具格式固定为 `[{name,json,schemaVersion,strictValid,legacyValid,issuePaths}]`，json 存字符串，可包含损坏 JSON；TypeScript 与 Java 两侧按相同模式判断。夹具位置由仓库根目录拼接，不能从编译输出文件的 import.meta.url 推断。

- [ ] **Step 3:** Run `npm run test:viewer:unit -- packages/gallery-contracts/test/viewerConfig.test.ts`；预期新接口尚不存在导致编译失败，记录红灯原因。
- [ ] **Step 4:** 实现上述接口及全部字段规则。strict 返回 issues，由调用方拒绝保存；legacy 将非法字段重置为默认并返回诊断。错误 JSON/根节点/版本/大小/深度以 issues 返回而非抛出页面异常。递归复制只用 Object.entries，危险键丢弃；序列化按固定顺序构造已知组，其余安全扩展排序追加。merge 先深合并再 strict 校验，存在 issues 抛 `ViewerConfigValidationError`（携带 issues）。冻结旧预设来自当前 ConfigManager，旧 layout 字符串先转换为 `{ mode }`。

```ts
const blocked = new Set(['__proto__', 'constructor', 'prototype'])
export function migrateLegacyConfig(input: Record<string, unknown>) {
  const copy = Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.has(key)))
  if (typeof copy.layout === 'string') copy.layout = { mode: copy.layout }
  return copy
}
// 深层遍历也使用同一 blocked 集合；输入不合法时绝不合并进默认配置。
```

- [ ] **Step 5:** 重跑本任务测试、`npm run typecheck`，验证真实夹具；仅暂存列出的任务文件，`git diff --cached --check` 后提交 `feat: unify viewer configuration and legacy compatibility`。

## Task 2: 后端保存、发布、回滚校验

**Files:** Create `apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/ViewerConfigValidator.java`、同模块 test 包的 `ViewerConfigValidatorTest.java`；Modify application `pom.xml`、`GalleryViewerConfigFacade.java`、`GalleryViewerConfigVersioningTest.java`。

**Interfaces:** `public String validate(String configJson, int schemaVersion)` 返回安全 JSON，失败抛 DomainException，code=`BAD_VIEWER_CONFIG`，不回显完整配置；requireSchema 的既有 `BAD_SCHEMA_VERSION` 保留。使用 BOM 管理的 Jackson databind，依赖加在 application，不把 Jackson 引入 domain。

- [ ] **Step 1:** 添加 JUnit 参数夹具测试（仓库夹具路径从 Maven reactor 根确定），并在 facade 现有 in-memory repository 测试中断言非法保存、发布、回滚不增加版本、不改变 published pointer。保留旧 `{ "layout":"sphere" }` 测试，拒绝时不要直接删掉旧用例。

```java
@Test void rejectsOversizedUtf8BeforeParsing() {
    var validator = new ViewerConfigValidator();
    var error = assertThrows(DomainException.class,
        () -> validator.validate("{\"note\":\"" + "照".repeat(23000) + "\"}", 1));
    assertEquals("BAD_VIEWER_CONFIG", error.code());
}
@Test void preservesLegacyLayout() {
    String result = new ViewerConfigValidator().validate("{\"layout\":\"sphere\"}", 1);
    assertTrue(result.contains("sphere"));
}
```

- [ ] **Step 2:** Run `mvn -pl apps/gallery-api/gallery-api-application -am test -Dtest=ViewerConfigValidatorTest,GalleryViewerConfigVersioningTest -Dsurefire.failIfNoSpecifiedTests=false`；预期类缺失或无校验导致新断言失败。
- [ ] **Step 3:** 实现 parser 使用 StreamReadConstraints 最大深度 8；读取前验证 UTF-8 字节数≤65536；根节点为 ObjectNode。Java 按共享规则表逐路径校验，缺少字段合法，null/错误类型非法，enum 和 number 范围与 TS 一致。legacy layout 字符串为例外合法形式。递归删除危险键，保留其他未知 JSON 字段，返回 ObjectMapper 序列化结果。

```java
byte[] bytes = configJson.getBytes(StandardCharsets.UTF_8);
if (bytes.length > 65536) throw new DomainException("BAD_VIEWER_CONFIG", "Configuration exceeds size limit");
JsonNode root = mapper.readTree(bytes);
if (!root.isObject()) throw new DomainException("BAD_VIEWER_CONFIG", "Configuration must be an object");
// 校验调用放在 configRepository.save / versionRepository.save 之前。
```

在保存入口先授权和确认相册，再验证输入；发布验证 draft；回滚验证 source 快照。不把规范化默认值写回旧快照。无效旧版本回滚返回可读错误，当前线上版本不改变。

后端兼容模式接受已知旧格式，但不默默接受越界字段；TS strict 保存前已将旧格式转换。Java 夹具针对历史格式检查 legacyValid，对其他项同时检查 strictValid，不能拿同一旧字段的两个不同模式结论当实现不一致。深度计数语义按夹具对齐，不能依赖 Jackson 默认计数恰巧一致。
- [ ] **Step 4:** 重跑本任务命令及 `mvn -pl apps/gallery-api/gallery-api-application -am test`。非法发布/回滚需用故意损坏的 repository 夹具，检查全部写入次数为零。
- [ ] **Step 5:** 检查暂存文件与 whitespace，提交 `fix: validate viewer config before draft and version writes`。

## Task 3: 八个完整共享场景

**Files:** Create `packages/gallery-contracts/src/viewerPresets.ts`、`packages/gallery-contracts/test/viewerPresets.test.ts`；Modify contracts `index.ts`、Viewer `core/ConfigManager.ts`；后续任务 9 移除管理端重复预设。

**Interfaces:** `VIEWER_PRESETS: Record<PresetName, ViewerConfig>`；`PresetName` 为八个 spec 名称；`applyViewerPreset(name: PresetName, current: ViewerConfig): ViewerConfig`；`restoreViewerPreset(current: ViewerConfig): ViewerConfig`。current.presetName 标记来源，current.customized 标记修改；场景切换不覆盖 quality、visitorAllowDownload、未知扩展和音频字段。

- [ ] **Step 1:** 写测试比较八个预设的关键参数指纹互不相同；依次从每个预设切到 minimal，验证无粒子、辉光、暗角和自动巡航残留。验证 only-presetName 的旧 minimal 仍是旧 sphere，并且显式设置优先。

```ts
test('switching away clears scene effects but retains access choice', () => {
  const current = normalizeViewerConfig({ visitorAllowDownload: true, quality: 'low' }, 'strict').config
  const romantic = applyViewerPreset('romantic', current)
  const minimal = applyViewerPreset('minimal', romantic)
  assert.equal(minimal.particles.enabled, false)
  assert.equal(minimal.effects.bloom.enabled, false)
  assert.equal(minimal.effects.vignette.enabled, false)
  assert.equal(minimal.camera.autoRotate, false)
  assert.equal(minimal.visitorAllowDownload, true)
  assert.equal(minimal.quality, 'low')
})
```

- [ ] **Step 2:** Run `npm run test:viewer:unit -- packages/gallery-contracts/test/viewerPresets.test.ts`；预期预设接口不存在。
- [ ] **Step 3:** 定义完整场景，克隆默认组后逐组写场景参数；配置卡片与 Viewer 均使用同一注册表。以如下确定起始值实现，其他新字段用 spec 默认值；人工截图允许调整视觉参数，但不能削弱性能标准。

| 名称 | 背景 color / secondaryColor | 粒子类型 / density / speed | 布局 | 后处理与相机 |
| --- | --- | --- | --- | --- |
| minimal | #0f172a / #0f172a，solid | [] / 0 / 0 | grid | bloom=false，grade=false，vignette=false，float=false |
| forest-dream | #061b14 / #234837，gradient | fireflies,sakura / 0.6 / 0.6 | helix | fog=#163124,0.0006；bloom=0.35；float=true |
| starry-night | #050817 / #18234b，gradient | stars,meteors / 0.8 / 0.7 | sphere | bloom=0.5；fog=false；autoRotate=true，rotateSpeed=0.25 |
| ocean-breeze | #082b3a / #277b8c，gradient | [] / 0 / 0 | spiral | fog=#0c4a6e,0.0006；grade 饱和度=0.9；bloom=false |
| sunset-glow | #24140f / #915a33，gradient | sakura / 0.4 / 0.6 | grid | sunset 光照；bloom=0.4；vignette=0.2 |
| romantic | #170d24 / #673d63，gradient | hearts,fireflies / 0.6 / 0.5 | carousel | bloom=0.45；float=true；fade 入场 |
| snowfall | #101c2b / #4a5d72，gradient | snow / 0.8 / 0.4 | grid | noon 光照；bloom=0.2；grade=false |
| film | #1b1612 / #1b1612，solid | [] / 0 / 0 | carousel | sunset 光照；grade 饱和度=0.8、对比度=1.12；vignette=0.35 |

背景 angle 均 135；未列举启用的效果显式关闭。开启 bloom 的 radius=0.5、threshold=0.25；开启 fog、grade、vignette 时才按表取值。场景不直接写任何页面 CSS 品牌变量。

```ts
export function applyViewerPreset(name: PresetName, current: ViewerConfig): ViewerConfig {
  const preset = structuredClone(VIEWER_PRESETS[name])
  return mergeViewerConfig(current, {
    layout: preset.layout, particles: preset.particles, effects: preset.effects,
    camera: preset.camera, lighting: preset.lighting, background: preset.background,
    interaction: preset.interaction, presetName: name, customized: false
  })
}
```

- [ ] **Step 4:** 重跑 contracts 全部测试、`npm run typecheck`；检查 ConfigManager 的 server、URL、偏好、import 入口均调用规范化；URL 只接受支持字段，不绕过参数边界。
- [ ] **Step 5:** 提交 `feat: share eight distinct gallery scene presets`。

## Task 4: 布局与粒子参数真正生效

**Files:** Modify Viewer `lib/layouts.ts`、`plugins/LayoutPlugin.ts`、`plugins/ParticlesPlugin.ts`、`core/types.ts`；Create `apps/gallery-viewer/src/lib/particleBudget.ts`、`apps/gallery-viewer/test/layouts.test.ts`、`particleBudget.test.ts`、`particleBehavior.test.ts`、`helpers/viewerContext.ts`。

**Interfaces:** `generateLayout(count: number, layout: ViewerConfig['layout']): LayoutPosition[]` 导出自 layouts；`allocateParticleCounts(base: Record<ParticleType, number>, types: ParticleType[], density: number, budget: number): Record<ParticleType, number>`；`ParticlesPlugin.getParticleCounts()` 返回只读类型计数用于运行指标；测试 helper `createViewerContext(config: ViewerConfig, photos?: PhotoMesh[]): ViewerContext` 使用真实 Three.Scene 和 EventBus，renderer 仅在无 WebGL 的单元中提供最小假的 canvas 能力。

- [ ] **Step 1:** 写位置和粒子数量测试，不能只比较配置对象；添加 1/2/3/50 张、radius/spacing/scale、网格 columns、helix height/turns、同布局热改参数，旧轴向 opts 保留。重复安装/卸载 Layout 后发送一次事件只能应用一次。

```ts
test('spacing affects positions and density zero allocates no instances', () => {
  const base = normalizeViewerConfig({ layout: { mode: 'sphere', params: { radius: 400 } } }, 'strict').config
  const spaced = mergeViewerConfig(base, { layout: { params: { spacing: 2 } } })
  const a = generateLayout(50, base.layout)[10]
  const b = generateLayout(50, spaced.layout)[10]
  assert.ok(Math.abs(b.x - 2 * a.x) < 1e-6)
  assert.deepEqual(allocateParticleCounts({ stars: 100, snow: 100, hearts: 0, sakura: 0,
    fireflies: 0, meteors: 0 }, ['stars', 'snow'], 0, 200),
    { stars: 0, snow: 0, hearts: 0, sakura: 0, fireflies: 0, meteors: 0 })
})
```

粒子行为测试使用 scene children 中 Points/InstancedMesh/LineSegments 的 BufferAttribute 或矩阵，固定种子和 elapsed：speed=0 时 update 不改变位置；size/color 热改后 material uniform 或实例 scale 改变；降低预算后实际实例总数不超限。随机源可注入默认 Math.random，测试固定函数，不开放新产品控件。
- [ ] **Step 2:** Run `npm run test:viewer:unit -- apps/gallery-viewer/test/layouts.test.ts apps/gallery-viewer/test/particleBudget.test.ts apps/gallery-viewer/test/particleBehavior.test.ts`；预期参数尚未贯通导致断言失败。
- [ ] **Step 3:** generateLayout 把规范参数映射到生成器 opts，保留旧 opts；生成后坐标乘 spacing，Mesh scale 根据 scale 调整。网格 columns→cols，helix height/turns 改为可传值，spiral radius→maxRadius、turns→旋转圈数；其他布局隐藏不适用参数。布局签名比较整个 layout，命名 handler 注册并完整 off。每次取消转场配对 transition:end，none 直接归位。

```ts
export function allocateParticleCounts(base: Record<ParticleType, number>, types: ParticleType[], density: number, budget: number) {
  const keys = ['stars', 'hearts', 'sakura', 'snow', 'fireflies', 'meteors'] as const
  const counts = Object.fromEntries(keys.map(k => [k, types.includes(k) ? Math.round(base[k] * density) : 0])) as Record<ParticleType, number>
  const sum = keys.reduce((n, k) => n + counts[k], 0)
  if (sum <= budget) return counts
  const desired = { ...counts }
  for (const k of keys) counts[k] = Math.floor(desired[k] * budget / sum)
  let remaining = budget - keys.reduce((n, k) => n + counts[k], 0)
  for (const k of keys) if (remaining > 0 && counts[k] < desired[k]) { counts[k]++; remaining-- }
  return counts
}
```

每类粒子自己的活动时间累计 `delta * speed`，冻结后恢复不跳跃。只在类型、density 或有效预算变化时重建实例，color/size/speed 用参数/uniform 更新；size 更新动态着色器及 CPU 实例两条实现。记录配置签名前复制 types，不对共享数组原地 sort。
- [ ] **Step 4:** 重跑本任务测试与 `npm run typecheck`；人工浏览器确认六类粒子形状与颜色，完整 GPU 检查归任务 6/10。
- [ ] **Step 5:** 提交 `fix: make layout and particle controls affect rendering`。

## Task 5: 统一时钟、串行热更新与插件生命周期

**Files:** Create Viewer `core/FrameClock.ts`、`test/frameClock.test.ts`、`test/pluginLifecycle.test.ts`、`test/configUpdates.test.ts`；Modify `core/ViewerEngine.ts`、`core/PluginManager.ts`、`core/types.ts`、`plugins/LightingPlugin.ts`、`plugins/PhotoFadePlugin.ts`、`plugins/LayoutPlugin.ts`、`App.vue`。

**Interfaces:**

```ts
export class FrameClock {
  tick(nowMs: number): { delta: number; elapsed: number }
  suspend(): void
  resume(nowMs: number): void
  get elapsed(): number
}
// ViewerContext 新增活动时间和 motion 偏好供插件读取。
// now(): number 返回活动秒数；reducedMotion(): boolean。
// ViewerEngine 保留 applyConfig(patch: Partial<ViewerConfig>): Promise<void>。
// Engine 新增 getRequestedConfig(): ViewerConfig，与运行有效配置分开。
```

- [ ] **Step 1:** 添加下面的时钟与插件测试；配置更新用可延迟完成的测试插件模拟 A 安装慢、B 最新，断言最终 B、最多一个同类插件、requested 只更新有效候选。插件抛异常后恢复上次候选且释放已安装的新资源。

```ts
test('hidden time does not advance animation', () => {
  const clock = new FrameClock()
  clock.resume(1000)
  assert.equal(clock.tick(1050).elapsed, 0.05)
  clock.suspend()
  clock.resume(9000)
  assert.equal(clock.tick(9050).elapsed, 0.1)
  assert.ok(clock.tick(15000).delta <= 0.1)
})
test('late plugin installation after dispose is uninstalled', async () => {
  const manager = new PluginManager()
  manager.setContext(createViewerContext(normalizeViewerConfig({}, 'strict').config))
  let finish!: () => void
  let removed = 0
  manager.register({ name: 'Slow', version: '1', install: () => new Promise<void>(resolve => { finish = resolve }),
    uninstall: () => { removed++ } })
  const pending = manager.install('Slow')
  manager.dispose()
  finish()
  await pending
  assert.equal(removed, 1)
  assert.equal(manager.getInstalled().length, 0)
})
```

增加：clickRipple false→true→false 的资源变化；仅 bloom strength 改变不重装；部分 particles density 更新不关 enabled；反复光照切换 transition 计数最终为零；fade 在活动时间 0.5 秒结束；reduced-motion 不启动持续动画；隐藏恢复后第一帧不触发降级。
- [ ] **Step 2:** Run `npm run test:viewer:unit -- apps/gallery-viewer/test/frameClock.test.ts apps/gallery-viewer/test/pluginLifecycle.test.ts apps/gallery-viewer/test/configUpdates.test.ts`；预期 FrameClock 缺失及 PluginManager 迟到结果未被清理。
- [ ] **Step 3:** 引擎替换混用的 Three.Clock/performance 时间。tick 将最大 delta 限为 0.1，elapsed 累加实际活动 delta；隐藏时 suspend 并取消 RAF，恢复重启但不补隐藏时间。Lighting/PhotoFade 的起点改为 context.now()，PhotoFade 用 map 中开始秒数+交错延迟更新，卸载清空 map，不创建 timers。

```ts
// applyConfig 的操作只由一个 drain 执行。pending 保存合并后的最新候选。
// updateRequested 在插件变更成功后提交；失败还原之前的插件集合与参数。
const candidate = mergeViewerConfig(this.pendingConfig ?? this.requestedConfig, patch)
this.pendingConfig = candidate
// drain: while(pendingConfig) 取出并清空，await reconcilePlugins(candidate)，再提交。
// 新调用复用 drain Promise；销毁时 pendingConfig=null，不再提交迟到结果。
```

`reconcilePlugins(candidate: ViewerConfig): Promise<void>` 是 ViewerEngine 私有方法，根据完整候选计算 Layout/Lighting/PhotoFade/Particles/Fog/ClickRipple/CursorTrail 的安装集合；后处理由任务 6 接管。参数变更统一只广播一次 config:update，Lighting 改为监听该事件；安装失败回收并重新 reconcile 上个有效配置。PluginManager 在 await loader、install 之后检查 disposed，释放该插件；dispose 未结束安装也不能重新 register。

reduced-motion 改变只影响 effective，requested 保存用户选择。相机动画和自动旋转由引擎管理，App 的 applyAutoTour 改为调用引擎，不再同时用另一个 RAF 写相机；拖拽 start 中断 intro。

PhotoFade 的 fade/rise/none 使用同一个时间调度器。rise 通过新增 `PhotoMesh.userData.entranceOffsetY?: number` 表达，PhotoFade 先更新 offset、Layout 再与布局/悬浮姿态合成，不让两个插件各自覆盖 position。插件更新顺序在 Engine 固定为 PhotoFade→Layout→其余效果；初始安装顺序不代替更新顺序。聚焦时非选中照片淡化，灯箱关闭发送 photo:blur 恢复透明；减少动态偏好下立即完成。为 rise/none/聚焦恢复各写位置或透明度行为断言。
- [ ] **Step 4:** 重跑全部 unit、`npm run typecheck`；WebGL 丢失/恢复、隐藏、销毁顺序真实浏览器验证进入任务 10。
- [ ] **Step 5:** 提交 `fix: synchronize animation time and safe live config updates`。

## Task 6: 独立后处理、场景背景与真实 GPU 验证

**Files:** Create Viewer `core/PostProcessing.ts`、`plugins/BackgroundPlugin.ts`、`test/postProcessing.test.ts`、`playwright.config.ts`、`e2e/helpers/mockGallery.ts`、`e2e/effects.spec.ts`；Modify `plugins/BloomPlugin.ts`、`plugins/FogPlugin.ts`、`plugins/index.ts`、`core/ViewerEngine.ts`、`core/types.ts`、`vite-env.d.ts`、Viewer `package.json`。

**Interfaces:**

```ts
export class PostProcessing {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera)
  apply(config: ViewerConfig['effects']): void
  resize(width: number, height: number, dpr: number, resolutionScale: number): void
  render(delta: number): void
  dispose(): void
  getState(): { bloom: boolean; grading: boolean; vignette: boolean; width: number; height: number }
}
// BackgroundPlugin 按现有 ViewerPlugin 接口注册，监听 config:update。
// 测试页面诊断仅 import.meta.env.DEV 或显式 VITE_VIEWER_DIAGNOSTICS=true 时开放。
```

diagnostics 定义为 `window.__VIE_VIEWER_DIAGNOSTICS__`，清理时删除。Task 6 在 core/types 中定义最小 snapshot 的 postProcessing 字段，Task 8 扩展为 ViewerDiagnostics。vite-env.d.ts 对 Window 声明可选属性，用例先等待其存在；生产无显式开关不暴露，不允许诊断接口绕过相册鉴权。

```ts
export interface ViewerDiagnosticApi {
  snapshot(): ViewerDiagnostics
  requestConfig(patch: Partial<ViewerConfig>): Promise<void>
  freezeTime(elapsed: number | null): void
  sampleQuality(sample: QualitySample): QualityDecision
  drainFrames(): Array<{ frameIntervalMs: number; cpuRenderMs: number; drawCalls: number }>
  photoMeshIds(): string[]
}
```

Task 6 先实现 snapshot/requestConfig/freezeTime/photoMeshIds，Task 8 增加 sampleQuality/drainFrames；未实现方法不先声明为空操作。freezeTime 仅测试冻结动画活动时间，仍然渲染和应用配置；null 恢复。meshId 使用 Three.Mesh.uuid，未初始化照片返回空数组；新增页面应保留已有 uuid。drainFrames 读取并清空容量最多 2400 的帧环形缓冲，长测试每秒读取，不能无限保存帧数据。

- [ ] **Step 1:** 增加 Node 测试：后处理 uniforms 的 neutral 值为 brightness/saturation/contrast=1、vignette=0；禁用所有效果时无需 composer；开启 grade 不依赖 bloom；resize 按实际 canvas 尺寸缩放；dispose 释放 pass 和 targets。测试用构造器依赖 seam 或真实 material 观察 dispose 事件，不用构造一个完整假的 WebGLRenderer。

创建真实 Playwright 配置，testDir=e2e，单 worker 确保性能资源测试互不干扰；webServer 命令 `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`，CI 禁止复用未知进程。与已有 admin Playwright 共用已安装包，Viewer 声明 `@playwright/test` devDependency 为根锁文件里的相同版本。

mockGallery(page, {config, count}) 使用 page.route 返回合法的 public gallery/config/photos 响应，照片使用仓库本地 SVG/PNG 路由提供确定的横竖颜色样片；分页每页 50，count 用于 Task 7/10。全部 pageerror 和 console.error 收集，只有主动故障注入指定错误可按 code 匹配放行。

```ts
import { test, expect } from '@playwright/test'
import { mockGallery } from './helpers/mockGallery'
test('grading renders without bloom', async ({ page }) => {
  await mockGallery(page, { config: { effects: { bloom: { enabled: false },
    postGrade: { enabled: true, saturation: 0 } } }, count: 12 })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().postProcessing.grading)).toBe(true)
  const before = await page.locator('canvas').screenshot()
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__.requestConfig({ effects: { postGrade: { enabled: false } } }))
  const after = await page.locator('canvas').screenshot()
  expect(before.equals(after)).toBe(false)
})
```

截图用固定时钟和禁用动画，避免两张不同图片只是粒子运动；截图差异之外断言 material uniform 和 composer 状态，并人工检查灰度效果。
- [ ] **Step 2:** Run `npm run test:viewer:unit -- apps/gallery-viewer/test/postProcessing.test.ts` 和 `npm --workspace apps/gallery-viewer run test:e2e -- effects.spec.ts`；预期独立 grade 与 diagnostics 接口不存在。
- [ ] **Step 3:** 把 composer 归 PostProcessing，复用现有 GLSL。调色公式顺序为 brightness→contrast→saturation→vignette；最终只一次 OutputPass。enabled 关闭时取中性 uniform，保持 alpha；bloom.enabled 不影响 grade/vignette。canvas/DPR/档位变化调用 `composer.setPixelRatio(dpr * resolutionScale)` 和 setSize(width,height)，Bloom pass 不再自己按 window 分辨率重置。逐 pass dispose 再 composer.dispose，render 只走一条路径。

```glsl
color *= uBrightness;
color = (color - 0.5) * uContrast + 0.5;
float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
color = mix(vec3(gray), color, uSaturation);
float edge = smoothstep(0.2, 0.75, length(vUv - 0.5));
color *= 1.0 - edge * uVignetteStrength;
gl_FragColor = vec4(max(color, vec3(0.0)), texel.a);
```

背景渐变生成一个小尺寸可重用 DataTexture，按 angle 插值两个颜色，使用正确 colorSpace；无须每帧重建。solid 设置 scene.background=Color。更换、卸载时释放旧纹理；Fog 只按配置生效，移除光照自动覆盖显式 fog/bloom 参数。

后处理初始化或 shader 失败时释放该链资源并直接 renderer.render，报告“已使用基础显示效果”；requested 仍保留原选择，允许重试。故障用例只注入后处理构造失败，验证照片和交互继续可用，不把整个 WebGL 故障与可选后处理故障混为同一种回退。
- [ ] **Step 4:** 跑 Node + GPU 两类测试，控制台无 shader compile/link 错误；八种场景初步截图，单独关闭 bloom/grade/vignette 检查互不牵连。
- [ ] **Step 5:** 提交 `feat: add independent grading vignette and scene backgrounds`。

## Task 7: 增量照片与预算内纹理驻留

**Files:** Create Viewer `core/PhotoScene.ts`、`core/TexturePool.ts`、`test/photoScene.test.ts`、`test/texturePool.test.ts`、`e2e/photo-resources.spec.ts`；Modify `App.vue`、`core/ViewerEngine.ts`、`core/types.ts`、`plugins/PhotoFadePlugin.ts`。

**Interfaces:**

```ts
export interface TextureBudget { maxEdge: number; bytes: number; concurrent: number; resident: number }
export interface LoadedTexture { texture: THREE.Texture; bytes: number }
export type TextureLoad = (url: string, maxEdge: number, signal: AbortSignal) => Promise<LoadedTexture>
export class TexturePool {
  constructor(budget: TextureBudget, load: TextureLoad)
  acquire(key: object, urls: string[], priority: number): Promise<THREE.Texture>
  touch(key: object, priority: number): void
  release(key: object): void
  setBudget(budget: TextureBudget): void
  dispose(): void
  getMetrics(): { resident: number; bytes: number; pending: number; active: number }
}
export class PhotoScene {
  constructor(scene: THREE.Scene, pool: TexturePool)
  sync(photos: PublicPhoto[]): { all: PhotoMesh[]; added: PhotoMesh[]; removed: PhotoMesh[] }
  updateVisibility(camera: THREE.PerspectiveCamera): void
  retry(photo: PublicPhoto): void
  dispose(): void
}
// ViewerEngine.syncPhotos(photos: PublicPhoto[]): void 将数据交 PhotoScene。
```

- [ ] **Step 1:** 用真实 Three.Mesh 的 dispose 事件计数，验证同一对象追加仍得到同一 Mesh；标题/顺序变化不误建纹理；完整换数组不同对象时释放旧资源；同 URL 不同照片允许纹理复用但引用计数正确。

```ts
test('append keeps original mesh identity', () => {
  const pool = new TexturePool({ maxEdge: 512, bytes: 32 * 1024 ** 2, concurrent: 2, resident: 32 },
    async () => ({ texture: new THREE.Texture(), bytes: 4 }))
  const photos = [{ title: 'one', thumbnailUrl: null, width: 800, height: 600, sortOrder: 0 }]
  const scene = new PhotoScene(new THREE.Scene(), pool)
  const first = scene.sync(photos).all[0]
  const next = scene.sync([...photos, { ...photos[0], title: 'two', sortOrder: 1 }])
  assert.equal(next.all[0], first)
  assert.equal(next.added.length, 1)
  scene.dispose()
})
```

TexturePool 测试用可手动 resolve/reject 的 loader：最大 active 并发、下载失败按 urls 回退、取消不写回、dispose 后到达结果 dispose 一次、低档减少预算立即释放可回收纹理、被请求对象移除后的 Promise 以 AbortError 结束且调用方捕获。快相机往返同 key 不重复 enqueue，公平队列避免某类照片永远得不到纹理。
- [ ] **Step 2:** Run `npm run test:viewer:unit -- apps/gallery-viewer/test/photoScene.test.ts apps/gallery-viewer/test/texturePool.test.ts`；预期新资源管理器缺失。
- [ ] **Step 3:** PhotoScene 用 Map<PublicPhoto,PhotoMesh> 保存身份，sync 只新增/移除差集。所有照片具有中性材质，得到纹理后才 fade；existing Mesh 仅更新 metadata/scale。引擎 photos:loaded 传全表给布局，新增 photos:added 给入场；PhotoScene 唯一拥有照片 geometry/material，Engine 不再次 dispose。

TexturePool loader 用 fetch+AbortController、createImageBitmap 解码、canvas 按 maxEdge 等比缩小，再 THREE.CanvasTexture；设置 SRGBColorSpace，释放 bitmap 并清理临时 canvas。发生跨域或 createImageBitmap 不可用时使用允许 CORS 的 Image 解码路径，不能用不受控的原尺寸 TextureLoader 绕过预算。下采样前有完整解码内存，限制下载并发与驻留解码对象，在报告中注明它不等于 GPU 预算。

每次 admit 先检查估算 bytes 和 resident 上限，LRU 驱逐非可见纹理。超过预算的可见照片按距相机和最近使用排序保留，其他回到占位；纹理复用按 URL+maxEdge 去重并引用计数。空回退 URL 不请求，textureUrl 与 thumbnailUrl 相同时只尝试一次。retained bitmap/blob 缓存与纹理共享同一字节上限，不允许另开无限图片缓存。

```ts
const estimatedBytes = Math.ceil(width * height * 4 * 4 / 3)
// admit 前驱逐，避免先创建超限纹理再回收。
// 完成回调先比较实例 generation 与 AbortSignal；过期 LoadedTexture.texture.dispose()。
// 接收后 material.map=texture; material.needsUpdate=true; emit('photo:texture-ready', mesh)。
```

- [ ] **Step 4:** 重跑资源 unit；GPU spec 用 200/500 张分页记录已有 Mesh 身份、load 请求计数和驻留预算，失败→重试→成功；异步加载中切 2D/3D 后无 pageerror、无旧纹理加入新引擎。
- [ ] **Step 5:** 提交 `perf: load gallery photo textures incrementally within budgets`。

## Task 8: 质量自适应、资源预算与诊断

**Files:** Create Viewer `core/QualityController.ts`、`test/qualityController.test.ts`、`e2e/quality.spec.ts`；Modify `core/ViewerEngine.ts`、`core/types.ts`、`core/PostProcessing.ts`、`core/TexturePool.ts`、`plugins/ParticlesPlugin.ts`、`App.vue`。

**Interfaces:**

```ts
export type Quality = ViewerQuality // 从 gallery-contracts 导入
export interface QualitySample {
  nowMs: number; fps: number; idle: boolean; hidden: boolean; loading: boolean;
  transitioning: boolean; contextLost: boolean
}
export interface QualityDecision { quality: Quality; fallback2D: boolean; reason: string | null }
export class QualityController {
  constructor(initial: Quality, ceiling: Quality, nowMs: number)
  sample(sample: QualitySample): QualityDecision
  reset(nowMs: number): void
}
export const QUALITY_BUDGETS: Record<Quality, TextureBudget & {
  dpr: number; particles: number; postScale: number
}>
export interface ViewerDiagnostics {
  requested: ViewerConfig; effectiveQuality: Quality; reason: string | null;
  elapsed: number; meshCount: number; particleCounts: Record<ParticleType, number>;
  textures: { resident: number; bytes: number; pending: number; active: number };
  geometryCount: number; drawCalls: number; fps: number; frameIntervalMs: number;
  cpuRenderMs: number; postProcessing: { bloom: boolean; grading: boolean; vignette: boolean; width: number; height: number }
}
```

- [ ] **Step 1:** 写确定时间测试覆盖 spec 全部阈值、冷却与排除状态；用户指定 low 不自动提升；移动 auto 的起点 low，桌面 auto 起点 mid；连续触发 budget 变化不改 requested。

```ts
test('idle throttling never downgrades', () => {
  const controller = new QualityController('mid', 'high', 0)
  let decision: QualityDecision
  for (let i = 1; i <= 20; i++) decision = controller.sample({ nowMs: i * 1000,
    fps: 20, idle: true, hidden: false, loading: false, transitioning: false, contextLost: false })
  assert.equal(decision!.quality, 'mid')
  assert.equal(decision!.fallback2D, false)
})
test('three bad windows downgrade once before cooldown', () => {
  const controller = new QualityController('mid', 'high', 0)
  let last!: QualityDecision
  for (let i = 1; i <= 3; i++) last = controller.sample({ nowMs: i * 1000, fps: 25,
    idle: false, hidden: false, loading: false, transitioning: false, contextLost: false })
  assert.equal(last.quality, 'low')
})
```

- [ ] **Step 2:** Run `npm run test:viewer:unit -- apps/gallery-viewer/test/qualityController.test.ts`；预期策略未实现。
- [ ] **Step 3:** 将 budget 表数值严格复制 spec。sample 排除不可用窗口并重置连续计数；低/高窗口各计数，降档后冷却 10 秒，升档后也冷却。low 的 <20 按有效样本累计满 5 秒才 fallback，不包括空闲。恢复时 reset 丢弃隐藏前窗口。粒子/后处理/纹理统一从同一质量通知更新，不能只改 renderer DPR。

```ts
const budget = QUALITY_BUDGETS[decision.quality]
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.dpr))
postProcessing.resize(canvas.clientWidth, canvas.clientHeight, renderer.getPixelRatio(), budget.postScale)
texturePool.setBudget(budget)
// effectiveConfig 推导 particles.countBudget、motion 限制，requestedConfig 不变。
```

有效配置预算字段放运行内部类型，不作为未知扩展序列化保存。纹理降档释放高清驻留；恢复按需补，不同时重新下载全部照片。metrics 分别记录调度间隔与 plugin update + controls + render CPU 时间，WebGL drawCalls 使用一帧 reset 后累计所有 pass，不能只统计最后 OutputPass。
- [ ] **Step 4:** Run unit + `npm --workspace apps/gallery-viewer run test:e2e -- quality.spec.ts`；测试诊断模式提供注入采样，不制造 CPU 忙循环；真实负载测量仍由任务 10 完成。断言降档时 postScale/粒子/纹理均改变，requested 序列化保持原值。
- [ ] **Step 5:** 提交 `perf: adapt gallery quality with bounded rendering resources`。

## Task 9: 配置工作台、可信预览与访问状态一致

**Files:** Create Admin `composables/useViewerConfigEditor.ts`、`lib/viewerPreviewChannel.ts`、`components/gallery-config/LayoutControls.vue`、`AtmosphereControls.vue`、`MotionQualityControls.vue`、`PresetCards.vue`、`e2e/viewer-config.spec.ts`；Modify Admin `views/GalleryConfigPanel.vue`、`lib/preview.ts`，Viewer `App.vue`、`composables/useViewerState.ts`、`vite-env.d.ts`。

**Interfaces:**

```ts
// useViewerConfigEditor.ts，既有草稿/历史/发布 URL 保留。
export function useViewerConfigEditor(galleryId: string): {
  config: Ref<ViewerConfig>; issues: Ref<ConfigIssue[]>;
  savedJson: Ref<string>; dirty: ComputedRef<boolean>;
  load(): Promise<void>; patch(input: unknown): void;
  preset(name: PresetName): void; resetPreset(): void; save(): Promise<boolean>
}
export interface PreviewApplied {
  type: 'VIE_CONFIG_APPLIED'; sequence: number; effectiveQuality: Quality;
  reason: string | null; error?: string
}
export function isTrustedPreviewMessage(event: MessageEvent, source: Window, origin: string): boolean
export function createViewerPreviewChannel(iframe: HTMLIFrameElement, onApplied: (message: PreviewApplied) => void): {
  send(config: ViewerConfig): number; accept(event: MessageEvent): void; dispose(): void
}
```

PreviewApplied 的 Quality 使用 contracts 中导出的 `ViewerQuality`（值为 low/mid/high）；将任务 8 的 Quality 定义为该类型的别名，管理端不导入 Viewer 源码。消息型别在 contracts 的 `viewerPreview.ts` 中定义并导出，保存配置 JSON 不包含 sequence 或有效预算。

- [ ] **Step 1:** Admin E2E mock 保存/读取/发布/历史 API，检查字段实际被保存；预览路由返回真实 Viewer 页面，不用假 HTML 画框。测试新增参数保存→刷新仍存在，未知扩展保留、quality 不丢、reset 只恢复效果不改变下载权限、预设自定义状态，以及非法颜色阻止请求并定位错误。

```ts
test('layout parameters and quality survive save and reload', async ({ page }) => {
  await page.goto('/app/galleries/config-fixture')
  await page.getByRole('button', { name: '配置', exact: true }).click()
  await page.getByLabel('照片间距').fill('1.5')
  await page.getByRole('button', { name: '高级', exact: true }).click()
  await page.getByLabel('画质上限').selectOption('mid')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('草稿已保存')
  await page.reload()
  await page.getByRole('button', { name: '高级', exact: true }).click()
  await expect(page.getByLabel('画质上限')).toHaveValue('mid')
})
```

补充 preview channel 单元（放 viewer/test/previewProtocol.test.ts，runner 支持导入 admin TS）：同 hostname 不同 port 被拒绝、正确 origin 错误 source 被拒绝、重连旧 source 和旧 sequence 不更新质量状态。密集拖动后最终 Viewer requested 值与工作台值一致。
- [ ] **Step 2:** Run `npm --workspace apps/gallery-admin run test:e2e -- viewer-config.spec.ts` 与 previewProtocol unit；预期参数控件不存在或保存时丢字段。
- [ ] **Step 3:** 编辑器保留完整规范配置，用 serialize 计算 dirty 和保存内容；patch 严格校验，新值不合法保留最后有效 config 并显示 field issue。原 beforeunload、自动保存和失败重试继续工作，保存开始时捕获 snapshot，成功只更新该 snapshot 的 savedJson，不能把请求期间的新编辑标已保存。

```ts
async function save(): Promise<boolean> {
  const snapshot = serializeViewerConfig(config.value)
  const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configJson: snapshot, presetName: config.value.presetName, schemaVersion: 1 })
  })
  if (!response.ok) return false
  savedJson.value = snapshot
  return true
}
```

实际补齐 try/catch/finally、权限和 loading 防重入；错误不得清空新编辑。组件按设计 8 的分组实现，input id/label、键盘、数值说明、颜色错误均可访问；边界直接使用共享规则。去掉音乐开关、godRays 等无消费者控件，但保留原 JSON 字段。

channel 的 origin 来自 new URL(iframe.src).origin，source 必须等于 iframe.contentWindow；不信任只比 hostname 的旧判断，也不信任 origin='null'。先识别 VIE_PREVIEW_READY，再发送带递增 sequence 的完整 config；ready 必须来自合法 source。120ms 节流保留最后候选，dispose 清定时器和监听。Viewer 严格校验并 await engine.applyConfig，再回执；失败回 error，不能先在 UI 宣告应用成功。

```ts
export function isTrustedPreviewMessage(event: MessageEvent, source: Window, origin: string): boolean {
  return origin !== 'null' && event.origin === origin && event.source === source
}
```

Viewer handle 消息只信任 window.parent、embed 模式以及既有开发/部署 origin 的明确计算值；新窗口 noopener 预览继续从服务端草稿读取，不要求 opener 通道。对 reinitialize/unlock 的 config 请求也带 requestVersion，先清空旧 viewerConfig，解锁后重新 await loadConfig；下载权限读取仅当前有效访问配置。
- [ ] **Step 4:** Run Admin E2E + preview unit + `npm run typecheck`；验证真实 iframe 的热更新无重载、错误 origin 无副作用、token 不进入日志；已有 creation-flow 和配置消费脚本同步更新到真实参数断言。
- [ ] **Step 5:** 提交 `feat: expose scene controls with reliable live preview feedback`。

## Task 10: 生命周期、视觉、性能与交付证据

**Files:** Create Viewer `e2e/config-lifecycle.spec.ts`、`e2e/performance.spec.ts`、`e2e/recovery.spec.ts`、`e2e/scene-visuals.spec.ts`、`e2e/helpers/performance.ts`、`docs/viewer-effects-performance-acceptance.md`；Modify 根 `package.json`、Viewer `package.json`、`docs/testing-guide.md`、`docs/README.md`；本任务截图/JSON 输出写 `.cache/viewer-acceptance/`。

**Interfaces:**

```ts
export interface PerformanceReport {
  revision: string; browser: string; renderer: string; hardwareAccelerated: boolean;
  viewport: { width: number; height: number }; dpr: number; photoCount: number;
  quality: Quality; presetName: string; durationMs: number;
  fpsMedian: number; frameIntervalP95: number; cpuRenderP95: number;
  textureBytesMax: number; residentMax: number; longTasksMaxMs: number;
  errors: string[]; rounds: number
}
export async function measureGallery(page: Page, count: number, quality: Quality, presetName: PresetName): Promise<PerformanceReport>
```

viewport 与具体质量固定，不用每次运行自动变档冒充同档性能进步。资源自动降级另有 Task 8 场景测试；性能报告保留实际有效质量。

- [ ] **Step 1:** 在自动化用例中固定照片和时间，验证八种预设无控制台异常、每组截图可辨；`effects.spec` 检查 shader 真实编译；逐控件修改→预览→保存→刷新→发布→读取→回滚，比较实际渲染和完整序列化配置。

config-lifecycle 中 mock 只能证明前端契约，另跑真实 API 环境流程验证持久化与权限。mock route 维护独立 draft、versions、published pointer，切换发布不能直接复制前端任意状态；已有 gallery config versioning JUnit 是后端门禁，完整真实链路需启动 infra/API。

```ts
test('WebGL loss keeps photos accessible in 2D', async ({ page }) => {
  await mockGallery(page, { config: { presetName: 'starry-night' }, count: 50 })
  await page.goto('/g/effects-fixture')
  await expect(page.locator('canvas')).toBeVisible()
  await page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
    if (!gl) throw new Error('No WebGL2 context for failure injection')
    const extension = gl.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('Context-loss injection unsupported')
    extension.loseContext()
  })
  await expect(page.getByRole('status')).toContainText('照片仍可正常浏览')
  await expect(page.getByRole('button', { name: /查看照片 1/ }).first()).toBeVisible()
})
```

增加 reduced-motion、隐藏→恢复、空相册、1 张竖图、长标题、空 URL、图片 CORS/失败/重试、错误 JSON、密码解锁和会话过期、发布/回滚失败不变更线上状态、快速场景切换中销毁。错误注入必须记录指定预期错误，不能整体关闭 pageerror 收集。
- [ ] **Step 2:** Run E2E recovery/config lifecycle；预期在相关实现缺失或恢复路径错误时出现真实断言失败，修正所属任务实现并重跑，不改成等待更久或删断言。
- [ ] **Step 3:** 实现 measureGallery。固定本地 12 张横竖图循环组成 50/200/500 张；用截图同组而非外部 CDN。热身 10 秒、采样 30 秒、3 轮；主动操作相机保证不进入 idle，排除加载/转场窗口。通过 diagnostics 在每帧采集实际渲染 frame interval、CPU update+render、drawCalls 和资源；计算 p50/p95 使用排序索引 `ceil(n*p)-1`。长任务使用 PerformanceObserver('longtask')，不支持时在报告标注，不能记为 0。

```ts
export function percentile(values: number[], p: number): number {
  if (!values.length) throw new Error('No measurement samples')
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
}
// 最终门槛直接断言，失败不得通过自动改低配置来隐藏。
expect(report.fpsMedian).toBeGreaterThanOrEqual(50)
expect(report.frameIntervalP95).toBeLessThanOrEqual(33)
expect(report.errors).toEqual([])
```

性能 spec 使用 1440×900 桌面 mid starry-night；真实移动通过连接受测设备运行 390×844 low forest-dream，再按移动门槛断言。无设备只跑功能响应式，报告留“未验证”，整体生产验收不签通过。

20 次预设切换与 10 次视图切换结束后，在同一个基准预设等待加载、转场结束再读稳定资源；每轮保存指标，检测增长趋势并检查 final 相对 initial 的 `max(initial*0.1,2)` 上限。500 张采样资源必须持续守预算；请求日志确认新增页没有重发已有 URL。

前后对照基线在执行开始时记录为第一个生产修改之前的 commit。在批准的隔离环境内建立该 commit 的单独基线 checkout，运行相同本地照片/浏览器/画质；只加诊断适配器读取原引擎 getMetrics 及 update+render 时间，不能应用新参数/预算。原引擎没有新 preset 时以现有 starry-night 的同配置字段对照，另报告新增场景结果；不能用不同视觉强度对比声称优化。保存两个 commit、指标 JSON、诊断适配器 diff，测试完成按工作树规则清理。
- [ ] **Step 4:** 执行以下门禁，在验收文档逐项写实际输出、证据路径、硬件和限制。命令按仓库根目录执行，独立命令失败后停止，不用 shell 分隔符掩盖 exit code。

```text
npm run test:viewer:unit
npm run verify
mvn -pl apps/gallery-api/gallery-api-application -am test
npm --workspace apps/gallery-viewer run test:e2e -- effects.spec.ts photo-resources.spec.ts quality.spec.ts recovery.spec.ts config-lifecycle.spec.ts
npm --workspace apps/gallery-admin run test:e2e -- viewer-config.spec.ts
npm --workspace apps/gallery-viewer run test:e2e -- scene-visuals.spec.ts
npm --workspace apps/gallery-viewer run test:e2e -- performance.spec.ts
```

Admin E2E 配置只自动启动 Admin，另启动 Viewer 且 origin 与 preview helper 一致。真实 API 流程的 infra 与既有 scripts 按 testing-guide 使用，不使用 mock 代替真实鉴权。Typecheck 和 build 若失败，按根因修复；不加忽略指令，既有截图不混入提交。

在根 `verify` 中加入 unit 门禁并保持原 docs/typecheck/build，性能测试单独命令和手动验收，因为需要可确认硬件。资源/恢复 E2E 可加入已有 CI 的相应前端任务；若 CI 配置不存在，不本次新增整套部署流程。验收文档的状态只能是“通过”“失败”“未验证”，记录最后测量日期和真实数据。
- [ ] **Step 5:** 人工审阅八种场景截图、桌面及移动控件操作、照片可读性和灯箱原色，记录检查者与结论；完成 code-review-and-quality 以及 verification-before-completion 要求后提交 `test: verify gallery effects lifecycle and performance budgets`。最终汇报功能改动、测试证据、仍未验证项和全部任务完成情况，不以 build 成功代替性能验收。

## 设计覆盖自查

| 设计章节 | 对应任务与证据 |
| --- | --- |
| 1–3 目标、范围、现有缺口 | 1–10 全链路；无收费、无重型新增引擎 |
| 4 契约、参数、意图/有效配置 | 1、2、4、8、9；TS/Java 夹具、往返与 actual render |
| 5 八种场景和旧名称 | 1、3、6、10；旧定义冻结、新预设指纹与截图 |
| 6 生命周期、后处理、动画 | 5、6、7；迟到资源释放、统一时间、独立效果 |
| 7 资源和自适应 | 4、7、8、10；预算、迟滞、分页与基线测量 |
| 8 工作台与预览 | 9；真实 iframe、序号、来源、保存竞争 |
| 9 兼容与失败恢复 | 1、2、5、6、7、9、10；旧格式、降级、回滚原子性 |
| 10 正确性、视觉、性能验收 | 10；真实设备和明确未验证项 |
| 11 分阶段实施 | 按任务 1–10 的依赖与独立提交执行 |

## 技术资料与本地依据

- [Node 内置测试入口](https://nodejs.org/api/test.html)：采用 node --test；不依赖当前机器 Node 24 的原生 TS 功能，保持项目 Node 18 入口可用。
- [esbuild Build API](https://esbuild.github.io/api/#build)：用已存在工具链的 build 编译测试入口，不另引入完整测试框架。
- Three.js API 以当前安装的 0.169 源码为准：`node_modules/three/examples/jsm/postprocessing/EffectComposer.js`、`OutputPass.js`、`UnrealBloomPass.js`；实施者需检查当前版本 setPixelRatio/setSize/dispose，避免按更高版本类型推断不存在的能力。
- 后端版本语义以 `GalleryViewerConfigFacade.java` 和 `GalleryViewerConfigVersioningTest.java` 为准；生产文案和端口以 `docs/testing-guide.md`、Admin `lib/preview.ts` 为准。

## 执行交接

计划需用户审阅并选择执行方式后开始生产代码修改。

- Native：主代理在当前会话按任务实现，完成后安排一次独立整体审查。推荐此方式：契约、引擎、资源和 UI 的接口依赖紧密，连续推进更容易维持一致，减少每项重新加载上下文的开销。
- Subagent-driven：每项由新的实施代理与审查代理执行，适合希望每个阶段都独立检查的情况，额外上下文开销更高。

未选择前不启动实施代理。若用户选 Native，使用 executing-plans；若选 Subagent-driven，使用 subagent-driven-development。执行前依据 using-git-worktrees 检查当前分支与隔离环境；当前设计和计划位于 `codex/viewer-effects-performance-design`，生产修改可使用该分支的新隔离工作树继续，不能遗漏已批准文档。
