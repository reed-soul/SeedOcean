# SeedOcean ↔ SeedThree 架构对比

> 内部技术备忘。记录 2026-07 审视 [SkyeShark/SeedThree](https://github.com/SkyeShark/SeedThree)（程序化树木生成器，Three.js WebGPU）后，对 SeedOcean（程序化海水系统，同栈）的改进决策。本文件是结论存档，不是用户文档。

## 结论先行

SeedThree 真正有技术含量的 **不是 Weber-Penn 算法本身** —— SeedOcean 的 FFT/JONSWAP + GPU butterfly IFFT 是同等级别的「教科书算法硬实现」：**Tessendorf 2001 之于海水 = Weber-Penn 1995 之于树**。两者都不缺「那个难算法」。

真正的差距在 **核心算法外围的工程架构** 上：SeedThree 把「研究 → 文档 → API → 契约」这条链做得完整一大截。下面具体拆。

---

## 一、SeedThree 值得学的 6 点（按含金量排序）

### 1. Headless / Agent API —— 最大架构差距 ⭐
`src/api/seedthree.js` 把「在浏览器里长一棵树」解耦成两层：

| 层 | 能力 | 是否需要 GPU |
|---|---|---|
| `generate()` / `skeleton()` / `statsOf()` | 纯几何 + 统计 | 否（Node/Deno 都能跑） |
| `createTree({ loadTexture })` | 真 PBR 材质 | 需要渲染器 |

配套设计：
- `describe()` **渐进式披露**：无参列物种 → 带物种列文件夹 → 带文件夹列旋钮。为 **agent 程序化构图** 设计的接口。
- `seedthree-preset/1` **版本化 JSON**，`toPreset`/`fromPreset` 双向 round-trip，和 App 的 Save 完全一致。
- `getSchema()` 把「这个物种有哪些可调旋钮」作为 **数据** 暴露（min/max/step/default）。

**SeedOcean 现状**：`seedocean.js` 强耦合 renderer+scene+camera，`_init()` 一上来 `new WebGPURenderer`。无 `generate`/`describe`/`schema`，preset 是 19 个分散对象、无 `format` 字段、无 round-trip。`src/index.js` 只是 live API barrel，**不是 design API**。

### 2. 研究型设计文档（`docs/generation-design.md`）
带 **置信度标记** 的研究综述：ez-tree（MIT ✅）、fable5-world-demo（MIT ✅，唯一认真的 WebGPU 原生森林）、Arbaro（GPL ⚠️「读参数源，**不要抄**」）、proctree.js（NONE ❌「404 on /license → 法律不安全」）。明确写 "Confidence flagged where sources were thin"。

**SeedOcean 现状**：`NEXT-SESSION.md` 是内部交接，`README` 是用户文档，**没有一份算法/文献综述/license 审计**。（→ 已由 `docs/ocean-fft-design.md` 补齐）

### 3. 「文档即契约」原则
`dichotomous-generator.md` 开篇：**"This doc is the contract... if the code and this doc disagree, the doc wins — fix the code."** 每条需求标注来源。治理纪律。

### 4. 添加物种的 Agent 工作流（三步契约）
README「Adding a species」是 3 步：写 preset → 生成纹理（chroma-key/dilate/derive-PBR 全脚本化）→ verify。还讲怎么绕开 Codex CLI 不能写文件的坑（`harvest-codex-image.mjs`）。

**SeedOcean 现状**：加 preset 要动 5+ 文件，**没有「Adding a preset」契约文档**。

### 5. 形态学档案（`docs/morphology.md`）
14 个物种跨 USDA FEIS/Silvics / Virginia Tech Dendrology / NC State / Morton Arboretum 交叉核对，纹理 prompt 按真实植物特征写（美国梧桐白色迷彩剥落树皮、北方红橡 "ski-track" 纵向亮纹、巨人柱手风琴棱）。每个物种有 **Signature** 鉴定特征。

**SeedOcean 现状**：19 个 preset 有调参，但没有「这份海态的物理依据/参考/鉴定特征」档案。

### 6. 平台深坑的工程化处理
- `tree.js` 的 `reuse` 参数：**WebGPU 每个 render object 编译一次 pipeline**，重建树时 **原地改写几何 attribute** 而非新建 Mesh，绕开 ~0.8s 编辑卡顿。靠 `lodName` 而非数组下标匹配（`applyLodMobile` 排序后下标会错位）。
- RNG 纪律：**parent-before-children 遍历顺序** 保证「加新特性不漂移已有 species+seed 输出」，点名避开 mulberry32（「skips ~⅓ of all 32-bit values」）。

**SeedOcean 同级洞察已存在**：`clipmap.js` 的 seam-stitching 注释（T-junction → 位移后开裂 → 复用内层 edge 顶点）质量与 SeedThree 最好的注释同级。**不是能力问题，是均匀度问题** —— 有些地方做到了，有些地方缺。

---

## 二、公平起见 —— SeedOcean 已强过 SeedThree 的 4 点

| 维度 | SeedOcean | SeedThree |
|---|---|---|
| **WebGL2 fallback** | Gerstner 降级，API 完全一致，视觉身份保留 | 也有降级，但未做到 API 完全统一 |
| **TypeScript 声明** | `.d.ts` 完整（445 行） | 无 |
| **Web Component** | `<water-canvas>` | 无 |
| **npm + CI** | 已发 npm + GitHub Actions CI | 仅 GitHub Pages demo |

clipmap seam-stitching 的工程注释质量，与 SeedThree 最好的注释同级。

---

## 三、改进清单（按 ROI 排序）

### 🔴 P0 — 架构级补齐（本次执行）

1. **`src/api/seedocean.js` Headless Design API** —— 对标 `seedthree.js`。两层：design 层（无 GPU：`listPresets`/`getSchema`/`describe`/`design`/`toPreset`/`fromPreset`）+ live 层（薄 adapter 复用 `SeedOcean.create`）。让 ocean 能被 agent 程序化设计、被第三方场景当库嵌。
2. **`docs/ocean-fft-design.md`** —— 研究综述 + license 审计 + 置信度标记。
3. **`seedocean-preset/1` 版本化 schema** —— 给 preset 加 `format` 字段 + `normalizePreset`，解锁 `toPreset/fromPreset` round-trip。
4. **`statsOf()` / `spectrumStats()` 内省工具** —— design API 的返回物，纯 CPU。

### 🟡 P1 — 后续

5. ✅ `docs/adding-a-preset.md` 契约文档（3 步：写 preset → 注册 → 验证）。
6. ✅ `docs/sea-states.md` 海态档案（19 preset 物理依据/参考/Signature）。
7. ✅ FlowMap (`seedocean-flowmap/1`) — 河向切线 + 湿岸泡沫，runtime 采样。

### 🟢 P2 — 后续

8. Demo 对象解耦：`_buildDemoObjects()` 写死 boat/buoy/crates → 改成 `demoObjects: () => [...]` 工厂或 preset 字段。
9. 注释纪律成文：把已有好注释（clipmap seam、flowOffset、celBands）的写作风格上升为项目规范。
10. Coastal Surf (Phase 11c) + shoreline editor (Phase 11d)。

---

## 四、第一性原理排序推导

依赖链 + 杠杆 + 风险三条原则：

```
Phase A 文档（零依赖·零风险·定调严肃度）── 并行先行
Phase B preset schema 版本化（解锁 headless API 的 toPreset/fromPreset）
Phase C statsOf() 内省工具（是 Phase D design() 的返回物，硬依赖）
Phase D headless Design API（最大架构杠杆，压轴）
```

**为何不是别的顺序**：headless API 的 `toPreset` 依赖 `format` 字段（B），`design()` 要返回 stats（C）；所以 D 不能先于 B/C。文档独立无依赖，先做既零风险又能立刻看到产出。

---

## 参考

- SeedThree 仓库：https://github.com/SkyeShark/SeedThree
- SeedThree 生成设计文档：`docs/generation-design.md`（zread 镜像）
- SeedThree headless API：`src/api/seedthree.js`（zread 镜像）
- Weber-Penn 原始论文：[SIGGRAPH 1995](https://courses.cs.duke.edu/fall02/cps124/resources/p119-weber.pdf)
- Tessendorf 原始论文：见 `docs/ocean-fft-design.md` 参考
