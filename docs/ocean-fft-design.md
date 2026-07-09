# FFT Ocean — Design Brief

> 架构决策备忘，记录 SeedOcean 的 FFT 海水 / meshing / foam / 着色管线的算法选型与实现取舍。
> 对标 SeedThree 的 `docs/generation-design.md`。置信度标记：✅ 已验证 / ⚠️ 理论合成未基准测试 / ❌ 已知坑。

## TL;DR 架构

- **核心引擎：Tessendorf 2001 的 FFT 海水**。GPU butterfly IFFT，3 级 cascade（200 m / 20 m / 3.5 m），JONSWAP 频谱（Hasselmann 1973）+ TMA 浅水修正，双 wind-sea + swell 频段。
- **表面网格：按 waterType 分三路** —— 开阔海洋用 **nested-ring clipmap**（Losasso GPU Gems 2，相机捕捉无限延伸），bounded water 用 **有限 patch**（pool/lake 矩形/圆形），河流用 **Catmull-Rom ribbon**。
- **泡沫：persistent / advected foam field** —— ping-pong 双 buffer + half-Lagrangian back-trace，`foamPersistence` 可调。
- **下游：TSL `positionNode` 顶点位移 + world-space 法线重建 + Jacobian 泡沫 + screen refraction/reflection + SSS + wake stamping + 多体浮力**。
- **降级：WebGL2 不可用时走 Gerstner-wave renderer**，保持 API 与视觉身份一致。

## 算法基线

### 频谱模型 —— JONSWAP + TMA

JONSWAP（Joint North Sea Wave Project, Hassmann et al. 1973）是有限风区（fetch-limited）风浪的经验频谱，是实时海水的工业基线：

```
alpha     = 0.076 · (g · fetch / windSpeed²)^(-0.22)        // Phillips 常数
peakOmega = 22   · (windSpeed · fetch / g²)^(-0.33)         // 峰值角频率
```

这两个闭式公式在 `src/core/fft/spectrum.js` 的 `fillSet`（CPU 纯算术）中计算，由 `applySpectrumParams` 写入 uniform。**TSL `Fn` 内核（`jonswap`/`frequency`/`directionSpectrum`）只在 GPU compute pass 中执行**——它们构建节点图，不能在 Node 里直接调用。headless 推导统计（`spectrumStats`）必须 **纯 JS 重写** 这两个公式 + 深水色散关系 `k_peak = omega_peak² / g` + 标准 JONSWAP 积分得 Hs。✅

TMA（Texel-Marsen-Arsdal）浅水修正：在 `spectrum.js` 的 `frequency`/`frequencyDerivative` 中通过 `tanh(k·depth)` 项实现浅水深度衰减。深水近似（depth→∞）时退化为 `omega² = g·k`。

### 反变换 —— butterfly IFFT

实现见 `src/core/fft/fft.js`：预计算 butterfly 表（CPU `fillButterfly`），构建 `logN` 级 h-step / v-step compute kernel（TSL `Fn(...).compute(N*N)`），dispatch 顺序在 `ocean-simulator.js:51-56`：
```
h-steps (by stage) → align if logN odd → v-steps (by stage) → align if logN odd → permute
```
align stage 把 scratch → field 拷贝，保证结果归属 `field` 与 logN 奇偶无关。⚠️ 该 dispatch 顺序是反复调试出的，改动前先看 `ocean-simulator.js:48-56` 注释。

### 三级 cascade —— 覆盖大波长 + 细节

单级 FFT 网格（典型 128² 或 256²）受 Nyquist + 采样精度限制，无法同时表达公里级涌浪和厘米级毛细波。解法是 **多级 cascade**，每级覆盖一个波长段：

| Cascade | lengthScale | 覆盖 | 用途 |
|---|---|---|---|
| 0 | 200 m | 长涌浪 | 远景大波形 |
| 1 | 20 m | 风浪主能 | 主视觉波形 |
| 2 | 3.5 m | 细节/毛细波 | 近景质感 |

级间边界由 `boundaryFactor` 控制（`ocean-simulator.js:26`）：低频截止 `cutoffLow = 2π/lengthScale[i] · boundaryFactor`，末级 `cutoffHigh = ∞`。⚠️ `lengthScales` 数组顺序与 `QUALITY_GRID`（`fft/defaults.js`）耦合，改一个要同步改另一个。

## 表面网格 —— 按 waterType 三路

### Clipmap（`src/core/clipmap.js`）—— 开阔海洋

nested-ring clipmap，相机捕捉（`updateClipmapOrigin` 做 `Math.floor` snapping）。Level 0 是密集中心 patch，每往外一级 extent 翻倍。

**关键工程：seam stitching**（`clipmap.js:1-19` 注释）。FFT 位移在世界空间采样，所以 **世界 XZ 相同的两个顶点位移后仍重合**。但 T-junction（粗环内边顶点稀疏、细层外边顶点密集）会导致粗环三角形跨越 0→14m 平直边、细层顶点独立位移 → 位移后沿 LOD 边界开裂。**修复：每环内边顶点 EXACTLY 是内层外边顶点**（传 `innerEdgeIdx` 数组复用），环只在径向外扩到更稀疏的外边。LOD 节省只活在径向，绝不在切向接缝。✅ 已验证（见 commit 8f67075）。

### Patch（`src/core/water-patch.js`）—— pool / lake

有限矩形或圆形 patch（`shape: 'rect' | 'circle'`），不跟随相机。bounded water 场景（泳池四壁、湖盆）用这个 —— clipmap 的无限延伸在 25 m 泳池里荒谬。

### River ribbon（`src/core/river-mesh.js`）—— 河流

Catmull-Rom 样条定义河中线，沿样条挤出 ribbon（左右各 width/2）。方向流通过 shader 内 **滚动采样坐标** 实现（`surface-material.js` 的 `flowOffset`）。当绑定 FlowMap 时，每 texel 的 RG 方向 × B 速度缩放替代均匀 `flowDir*flowSpeed`，使弯道切线跟随中心线。

### FlowMap（`src/core/flow-map.js`）—— 空间变化流 + 湿岸泡沫 ✅

`seedocean-flowmap/1` RGBA DataTexture（与 WakeField 同模式）：

| 通道 | 含义 |
|---|---|
| R/G | 有符号流向（`(v*0.5+0.5)*255`） |
| B | 速度缩放 ∈ [0,1]，乘以 preset.flow.speed |
| A | 湿岸泡沫覆盖 |

烘焙纯 CPU：`bakeRiverFlow`（中心线切线）、`bakeShoreRing`（湖盘边缘）、`bakeShoreChannel`（河岸）、`bakeCoastalSurf`（深度破碎带 + 向岸 rush）。湖/河/海岸自动启用；ocean/pool 默认关闭。⚠️ 湖岸泡沫必须按 **水面网格边缘** 烘焙，不能按地形 `h≈0`——盆地在盘下约 −6 m，水位线交叉测试会把整个湖床刷白。海岸则相反：`terrain.beach` **会**穿过 y=0，所以用高度/深度烘焙。

## Foam —— persistent / advected

`src/core/fft/maps.js` 的 `createCascadeMaps`：每 cascade 维护 ping-pong 双 foam buffer。`evolve` 流程（`ocean-simulator.js:111-115`）：
1. `assembleGroup` 写 displacement（`.w = breaking source`）
2. swap foam buffer
3. `advectGroup` 做 half-Lagrangian back-trace（沿流速反向追踪上一帧位置采样）
4. swap 回来，`c.foam` 持有最新状态

`foamPersistence` uniform（0 = 瞬时消失，1 = 永久保留）实际是反向的 `foamDecay`：`foamPersistence = 1 - foamDecay`。✅

## 着色 —— TSL NodeMaterial

`src/core/fft/surface-material.js` 的 `createFFTSurfaceMaterial` 构建一个 `MeshPhysicalNodeMaterial`：

- **`positionNode`**：Fn 内累加三级 cascade 的 displacement 纹理采样 + wake 高度。⚠️ **关键坑**：必须用 `positionLocal` 而非 `positionWorld` 构建 `worldXZ` —— `positionNode` 位移的是 `positionLocal`，而 displacement 又在世界空间采样，若 `worldXZ` 依赖位移后位置会形成 **循环依赖**。`clipOrigin` uniform 提供 world offset（clipmap 捕捉时更新）。
- **`normalNode`**：从 derivatives 纹理重建法线（slopeX/slopeZ），叠加 detail texture 双层噪声。
- **`colorNode`**：Fresnel + SSS（`pow(dot(V, H_negate), 4)` crest glow）+ Jacobian foam + wake foam + 深度 tint。cel-shaded 变体（Cartoon/Ink Wash preset）通过 `floor(fresnel · celBands) / celBands` 量化。

## WebGPU + TSL 深坑（r171+）

1. **`await renderer.init()`** 后再渲染（`main.js` 已做）。`.renderAsync()` 用于手动帧。
2. **import 纪律**：`three/webgpu` + `three/tsl`。混用 bare `'three'` 和 `'three/webgpu'` 会 break。✅ 已踩过（commit af6a070：从 `three/tsl` 补 import `floor`+`step`，否则 prod bundle 黑屏）。
3. **`attributeArray` 在 WebGL2 fallback 忽略 index**：`instancedArray.element(index)` 在 WebGL2 后端忽略 index、WebGPU 正确索引 —— 实例化 wind/foliage 要在两个后端都测。
4. **`reflector` 需 renderer**：`surface-material.js:44` 的 `reflector({ resolutionScale })` 是 GPU render object，headless 不可构建。
5. **`forceWebGL` 降级**：`navigator.gpu` 不可用时走 Gerstner fallback（`seedocean.js:73-77,151-153`），`buildGerstnerOcean` 用解析波、无 compute shader，但保持 `getHeight`/`evolve`/`applyPreset` 同签名。
6. **GPU 边界**：`OceanSimulator` 构造（`ocean-simulator.js:11`）起即需 renderer —— `attributeArray`、cascades、FFT、storage textures 全是 GPU 资源。**这是 headless API 的天然断层**：上游（JONSWAP 参数、几何、terrain heightFn、buoyancy 数学、wake field）全纯 CPU，断层在 FFT dispatch。

## 可复用参考 / license 审计

| 项目 | License | 用途 | 备注 |
|---|---|---|---|
| **poseidon**（owenyuwono）`github.com/owenyuwono/poseidon` | **MIT** ✅ | FFT ocean 参考实现 | README 已引用为本项目 pattern 来源 |
| **Crest URP**（wave-harmonic）`github.com/wave-harmonic/crest` | **Apache 2.0** ✅ | 商业级 ocean 参考（Unity） | 读作算法/UX 参考，**不可抄代码**（不同引擎，且需 attribution） |
| **Three.js Water Pro V3** | **商业 $199** ❌ | 对标付费方案 | 仅作功能对标基准，**不可抄** |
| **Tidewater** / **Three.js Water** | **商业 $75** ❌ | 对标 | 同上 |
| **Tessendorf 2001**（论文） | 学术公开 | 算法源 | "Simulating Ocean Water"，SIGGRAPH course notes |
| **shadertoy ocean** 作品 | 各异（按作者） | 仅思路引用 | 不抄代码，shader 许可复杂 |

**结论**：SeedOcean 的算法参考链是 poseidon（MIT，已正确引用）+ Tessendorf 论文（学术公开）+ Crest（Apache，仅 UX 参考）。无 license 风险。⚠️ 若未来引入新参考实现，必须先查 license 并在此表登记。

## 置信度备注

- 三级 cascade 的 `lengthScales`（200/20/3.5）是调参经验值，非 Tessendorf 论文硬性规定 —— 改动需同步 `boundaryFactor` 和 `QUALITY_GRID`。
- `spectrumStats` 的 Hs 闭式估计是标准 JONSWAP 积分近似，与实际 GPU 渲染出的波高会有 ±15% 偏差（离散采样 + cascade 截断）—— 作为 **设计期预估** 足够，不作为运行期测量。
- clipmap seam stitching 已在 commit 8f67075 验证消除了 nested-square 裂缝，但极端相机角度（近垂直俯视）下未做基准测试。

## 参考

- Tessendorf, J. (2001). *Simulating Ocean Water*. SIGGRAPH Course Notes.
- Hasselmann, K. et al. (1973). *Measurements of wind-wave growth and swell decay during the Joint North Sea Wave Project (JONSWAP)*. Dtsch. Hydrogr. Z.
- Losasso, F., Hoppe, H. (2004). *Geometry Clipmaps*. GPU Gems 2, Ch. 2.
- Bouws, E. et al. (1985). *Similarity of the wind wave spectrum in finite depth water* (TMA spectrum). Dtsch. Hydrogr. Z.
- GPU Gems 3, Ch. 18. *Using Vertex Texture Displacement for Terrain*（foam advection 思路来源之一）。
