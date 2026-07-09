# SeedOcean 推广文案包 v2

> **用途**：你回来后，5 分钟覆盖五大平台。每条帖子已配好图片直链，复制粘贴即可。
> **首选发布顺序**：Twitter（先发，要带图）→ Hacker News（同内容 Show HN）→ Reddit（不同文案）→ Three.js Discourse → 中文社区。
>
> **v2 更新（2026-07-09）**：预设数从 14 → **20**；新增 Coastal Surf 预设（海滩地形 + 碎浪白沫）和交互式海岸线笔刷（Shift+拖拽在水面绘制水流/海岸泡沫，可导出 preset JSON）。Twitter 文案改为**主推文不含链接 + 链接放 thread 评论**（避免外链限流）。
> **图片地址前缀**：`https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/`
> **Live demo**：<https://reed-soul.github.io/SeedOcean/>
> **Repo**：<https://github.com/reed-soul/SeedOcean>

---

## 渠道一：Twitter / X（首发，必须带 GIF/图）

**为什么首发**：WebGPU/图形圈核心人物（@mrdoob、@Atrix、@cdata）都在这里，被转一条能连锁带量。

> ⚠️ **教训（已验证）**：X 算法对带外链的推文降权最狠，尤其新号 + 短文本 + 链接的组合。**主推文绝不放任何链接**——先用 GIF/文字钩子拉曝光，链接放在 thread 的**第一条回复**里。读者点进推文照样能看到。

### 主推文 A（推荐：纯文字钩子 + GIF，不含链接，≤280 字）

> Made an open-source FFT ocean for Three.js 🌊
>
> 20 sea states — glassy dawn, tempest, bioluminescent night, cel-shaded cartoon. Plus a shift-drag shoreline brush that paints flow & foam onto the live wave field.
>
> WebGPU-first, WebGL2 fallback, one-line `<water-canvas>` component.

- ✅ 不含链接（避免限流）
- ✅ ~260 字符
- **配图**：`demo.gif`（`https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/demo.gif`）

### 主推文 A 的第一条回复（thread，放链接）

> Live demo (Chrome/Edge 113+) ↓
> https://reed-soul.github.io/SeedOcean/
>
> Source + install:
> https://github.com/reed-soul/SeedOcean

### 主推文 B（备选：突出海岸线笔刷这个新交互卖点）

> The part I'm most happy with: a shoreline brush. Hold Shift, drag on the water, and it paints flow direction and breaking foam straight into the live FFT wave field. Stroke → preset JSON.
>
> Built on SeedOcean, an open-source ocean system for Three.js (WebGPU).

- ✅ 不含链接
- **配图**：`presets/surf.webp`（新海岸冲浪预设，最能体现笔刷效果）

### 主推文 B 的回复（thread）

> 20 sea-state presets, persistent foam, buoyancy, underwater caustics. Live demo + source in the thread 👇
> https://reed-soul.github.io/SeedOcean/
> https://github.com/reed-soul/SeedOcean

### 帖子 C（"how it works"长推，48h 后发，长尾）

> How SeedOcean renders real-time FFT ocean in the browser 🧵
>
> 1/ GPU FFT via WebGPU compute, JONSWAP spectrum seeding, persistent foam advected across frames.
> 2/ Clipmap LOD so the ocean extends to the horizon without z-fighting.
> 3/ FlowMap drives shoreline break + river directional current; a shift-drag brush paints it live.
> 4/ WebGL2 + Gerstner fallback keeps the API identical when WebGPU isn't available.
>
> Repo + live demo: <https://github.com/reed-soul/SeedOcean>

---

## 渠道二：Hacker News（Show HN，涨 star 杠杆最大）

**为什么重要**：一条上首页的 Show HN = 几百到上千 star，是同类技术项目验证过 ROI 最高的渠道。**早上美西 7-9 点（北京时间深夜 22-24 点）发**，命中美国工作日开始。

### 标题（三选一，A/B 测试手感）

- `Show HN: Open-source FFT ocean for Three.js (WebGPU, 20 presets)` ✅ 推荐
- `Show HN: SeedOcean — real-time procedural ocean in the browser via WebGPU`
- `Show HN: A WebGPU FFT ocean system with a WebGL2 fallback, for Three.js`

### 正文（HN 偏好第一人称、朴实、技术细节）

> Hi HN,
>
> I've been building SeedOcean, an open-source FFT ocean rendering system for Three.js. It's WebGPU-first with a WebGL2/Gerstner fallback so the API stays identical when WebGPU isn't available.
>
> What's in it:
>
> - GPU FFT with a JONSWAP wave spectrum
> - Persistent, advected foam (the foam streaks you see on a real sea)
> - 20 presets — realistic day/night/tropical/storm, cel-shaded "Cartoon" and "Ink Wash", bounded water types (pool, mountain lake, flowing river), and a Coastal Surf preset where waves break on a sloping beach
> - A FlowMap that drives shoreline white-water break and river directional current — paintable live with a shift-drag shoreline brush (strokes export to preset JSON)
> - Buoyancy, underwater caustics, atmospheric spray and rain
> - A `<water-canvas>` web component for drop-in use
> - TypeScript types throughout
>
> Live demo (Chrome/Edge 113+): <https://reed-soul.github.io/SeedOcean/>
> Source: <https://github.com/reed-soul/SeedOcean>
> `pnpm add seedocean`
>
> The hardest parts were the clipmap LOD stitching (eliminating nested-square cracks at the horizon) and keeping the FFT numerically correct for odd logN — N=8/32/128 were silently broken for a while. Happy to dig into any of it in the comments.

**发布后 2 小时内**：盯评论区，前几个问题认真答（HN 前 2h 互动决定能否上首页）。

---

## 渠道三：Reddit（图形圈转化率最高）

**关键**：每个 subreddit 文案要不同（Reddit 重度反对跨版复制粘贴），**发之前先看版规**，尤其 r/threejs。

### r/webgpu（最对口）

**标题**：`SeedOcean — open-source FFT ocean for Three.js, WebGPU-first (20 presets, live demo)`

**正文**：
> Built this over the last few months. GPU FFT + JONSWAP on WebGPU compute, clipmap LOD to the horizon, persistent foam, buoyancy, underwater, spray/rain. WebGL2 fallback with Gerstner waves keeps the same API when WebGPU isn't there.
>
> 20 presets including stylized cel-shaded "Cartoon" and "Ink Wash", bounded water types (pool / mountain lake / flowing river), and a Coastal Surf preset where waves break on a sloping beach via a FlowMap. There's also a shift-drag shoreline brush that paints flow direction and foam onto the live wave field and exports the stroke to preset JSON.
>
> Live demo: <https://reed-soul.github.io/SeedOcean/>
> Repo: <https://github.com/reed-soul/SeedOcean>
>
> Especially interested in feedback on the clipmap LOD seam stitching — eliminating the nested-square cracks at the horizon took a few iterations. Anyone here done similar?

**配图**：`hero.webp`

### r/threejs

**标题**：`[Showcase] SeedOcean — open-source FFT ocean system for Three.js (WebGPU, 20 presets, drop-in web component)`

**正文**：
> Sharing a water system I've been working on. Drop-in via a `<water-canvas>` web component or as a library:
>
> ```js
> const ocean = await SeedOcean.create({ renderer, scene, camera, preset: 'coastal', quality: 'quality' });
> ocean.tick();
> ```
>
> 20 presets, persistent foam, buoyancy, underwater caustics, a 256² quality mode, and a WebGL2 fallback for when WebGPU isn't available. Newest addition is a Coastal Surf preset with a FlowMap-driven shoreline break, paintable via a shift-drag brush.
>
> Demo: <https://reed-soul.github.io/SeedOcean/>
> GitHub: <https://github.com/reed-soul/SeedOcean>

**配图**：`presets/coastal.webp` + `presets/surf.webp`

### r/proceduralgeneration

**标题**：`Real-time procedural FFT ocean in the browser (JONSWAP spectrum, WebGPU)`

**正文**：
> SeedOcean — procedural ocean driven by a JONSWAP wave spectrum with GPU FFT, plus procedural fBm terrain for the bounded water scenes (mountain lake basin, river gorge, sloping beach). 20 sea states from glassy dawn to tempest, and stylized cel-shaded modes. A shift-drag brush lets you paint flow and shoreline foam straight into the wave field.
>
> Demo: <https://reed-soul.github.io/SeedOcean/>
> Source: <https://github.com/reed-soul/SeedOcean>

**配图**：`demo.gif`（这个版偏爱动图）

### r/graphics（可选，技术深度向）

**标题**：`SeedOcean: real-time FFT ocean (JONSWAP + clipmap LOD) on WebGPU, with a WebGL2 fallback`

**正文**：偏实现细节，引用 r/webgpu 的内容但更技术化，少营销词。

---

## 渠道四：Three.js Discourse（精准，量小但高质量用户）

**地址**：<https://discourse.threejs.org/c/showcase>

**标题**：`SeedOcean — open-source FFT ocean system (WebGPU, 20 presets, web component)`

**正文**：用 r/threejs 的文案，语气更"社区成员分享"。

---

## 渠道五：中文社区（掘金 / 知乎 / V2EX）

### V2EX（节点：`/go/create_programmer` 或 `/go/share_project`）

**标题**：`[分享创造] 开源了一个 Three.js 的 FFT 海洋渲染系统 SeedOcean（WebGPU）`

**正文**：
> 折腾了几个月，给 Three.js 写了一个开源的 FFT 海洋渲染系统，WebGPU 优先，WebGL2 兜底，API 完全一致。
>
> - GPU FFT + JONSWAP 海浪谱
> - 持久化泡沫（随帧平流，像真实海面）
> - 20 个预设：写实（黎明/热带/暴风/生物发光/北极），风格化（卡通描边、水墨），有界水域（泳池/高山湖/流动河流），还有海岸冲浪预设（波浪在缓坡海滩上破碎成白沫）
> - FlowMap 驱动海岸白沫和河流方向流；配一个 Shift+拖拽的海岸线笔刷，能直接在波浪场上画水流和泡沫，笔刷轨迹可导出 preset JSON
> - 浮力、水下焦散、大气喷雾和雨
> - 一行 HTML 嵌入：`<water-canvas preset="coastal" quality="quality" demo></water-canvas>`
> - 全 TypeScript 类型
>
> 在线 demo（需 Chrome/Edge 113+）：<https://reed-soul.github.io/SeedOcean/>
> 源码：<https://github.com/reed-soul/SeedOcean>
> `pnpm add seedocean`
>
> 最难的两块：clipmap LOD 的接缝缝合（地平线处嵌套方块的裂缝），以及 FFT 在奇数 logN 下的数值正确性（N=8/32/128 一度悄悄算错）。欢迎拍砖。

### 掘金（偏长文，可后续展开）

标题候选：`用 WebGPU 在浏览器里渲染一片真实的大海：SeedOcean 开源实录`

---

## 发布时机建议

| 时段（北京时间） | 平台 | 原因 |
|---|---|---|
| 深夜 22:00–24:00 | Hacker News | 美西早晨，命中工作日开始 |
| 任意，但避开周末 | Twitter | 工作日互动率更高 |
| 美东早晨对应北京晚上 | Reddit | 美国 user 活跃期 |
| 工作日晚上 | V2EX / 掘金 | 中文圈活跃期 |

## 涨 star 30 天节奏

- **Day 0**：Twitter + HN 同步发（HN 标题别和推文完全一样，避免被判自我刷量）
- **Day 1**：Reddit（三版分开发，间隔几小时）
- **Day 2**：Three.js Discourse + V2EX
- **Day 3–7**：盯评论区、答问题（前 3 天互动决定算法权重）
- **Day 7**：Twitter 长推"how it works"
- **Day 14**：挑一个评论区高赞问题，写成短博文，再发一次推
- **Day 30**：如 star 破 500/1k，发"里程碑"感谢推

## 素材直链速查（复制即用）

| 素材 | 直链 |
|---|---|
| GIF 动图 | `https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/demo.gif` |
| Hero | `https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/hero.webp` |
| Wake（船尾迹） | `https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/wake.webp` |
| Underwater（水下焦散） | `https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/underwater.webp` |
| Preset: 生物发光 | `.../presets/bioluminescent.webp` |
| Preset: 暴风 | `.../presets/storm.webp` |
| Preset: 卡通 | `.../presets/cartoon.webp` |
| Preset: 黎明 | `.../presets/dawn.webp` |
| Preset: 沿海 | `.../presets/coastal.webp` |
| Preset: 月夜 | `.../presets/moonlit.webp` |
| Preset: 北极 | `.../presets/arctic.webp` |
| Preset: 水墨 | `.../presets/ink.webp` |
| Preset: 长涌 | `.../presets/swell.webp` |
| Preset: 游泳池 | `.../presets/pool.webp` |
| Preset: 高山湖 | `.../presets/lake.webp` |
| Preset: 河流 | `.../presets/river.webp` |
| Preset: 热带 | `.../presets/tropical.webp` |
| Preset: 风暴 | `.../presets/tempest.webp` |
| Preset: 日落 | `.../presets/sunset.webp` |
| Preset: 海岸冲浪（新） | `.../presets/surf.webp` |

（preset 链接前缀均为 `https://raw.githubusercontent.com/reed-soul/SeedOcean/master/docs/assets/presets/`）

## 关于"用 opencli 自动发推"——实测经验（v2 更新）

这一节是**实测后的结论**，不再是预判：

1. **能发出去，但有坑**：用 `opencli browser` + 已登录的 X profile 确实能发出推文（已实测两条）。但——
2. **直接在推文正文里放链接 = 限流**：X 对带外链推文（尤其新号 + 短文本）降权最狠。**正确做法是主推文不放链接，链接放 thread 回复**（本文件 v2 的 Twitter 渠道已按此重写）。
3. **opencli 的真实价值在素材，不在发帖**：`opencli browser shot` 驱动真实 Chrome 抓 WebGPU 是它最强用途（已在 `scripts/capture-media.mjs` 验证，playwright 软渲染跑不动 WebGPU）。发帖本身人工复制粘贴更稳。
4. **Reddit 账号受限**：实测 Reddit 新版提交页对该测试账号静默不渲染标题框（跨 r/webgpu / r/threejs / r/graphics 三个版块一致），疑似新号/低 karma 风控。Reddit 发帖建议用有 karma 的账号手动发。
5. **Three.js Discourse 新号首帖进审核队列**：已提交的帖子在版主审批后才公开，属正常反垃圾流程，不是失败。
