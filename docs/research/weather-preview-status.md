# 离线视觉原型验证（2026-10-17）

在 main 262503b 上的独立 research/weather-scene 分支。原始手写原型保留于 14a03d7；随后按避免重复造轮子要求接入官方 npm three-nebula 13.3.0（MIT）。仅本地预览，不发布。

## 已验证

- 确实复用 Nebula System/Emitter/初始化器及雪的 RandomDrift、Gravity，来源为官方 Snow 配方。精确下载来源、SHA256、许可和适配差异见 vendor/nebula/UPSTREAM.md。
- UMD 使用项目现有 Three r148，不引入第二套 Three。真实云 Chromium SwiftShader 环境完成红色车漆的基线、雨、雪、晴夜星空渲染及 shader 编译检查。
- 官方示例的逐粒子 SpriteRenderer 改为项目自有 Three Points 批次呈现，固定预算雨160、雪80、星100。并非原封不动官方示例，也不是把手写运动冒充库复用。
- 13.3.0 的 emit('once') 类型声明与实现不符，实际需 emit(1)。已加入实际粒子数量回归断言，避免只有空发射器却声称成功。
- 单一现有 animate() 驱动，delta 封顶50ms、交叉淡入淡出、resize/DPR≤2、资源释放测试通过。没有额外 RAF、网络、GPS、权限或 key。
- 独立主 scene Group，不加入 mirrorScene；屏幕矩形遮罩保护车辆、歌词、频谱、歌名和按钮。星仅上方天空。车包围盒逐可见 mesh 投影，避免整体包围盒错误遮住整屏。
- query 参数 weatherPreview=none|rain|snow|stars 才启用模拟。预览红漆 storage=null，不改出厂默认或保存颜色。
- tests/weather-preview.html 使用单个场景切换。四格图片由依次实际截图经 HTML 排版后再截取；各格时间不同，非同帧、非生成式效果图。
- Node 全套98项通过，包括新增5项天气测试。内联脚本语法与 git diff --check 通过。

## 验证边界与后续

- 仅云端软件渲染预览；未测试 Android debug APK/真实车机 GPU、真实 GPS/天气数据、播放中四种FFT与歌词的完整组合。
- 不报告实测车机帧率或 draw calls。代码每个可见天气层一个 Points 批次，切换期间可能两个；这不等于已测量整场景 draw calls。
- 同时创建四个完整3D场景导致云软件渲染页面崩溃（code9），故改为单场景依次截图。不能据此推断目标车机单场景性能。
- 车遮罩投影仍有逐帧临时对象分配，工程化前应复用对象、缩小遍历范围；必须在目标设备测量开关前后帧时间和内存。
- 未 push / PR / merge / 发布。没有取得或传输坐标。GPS权限与指定供应商的位置共享确认仍是接真数据前的独立决定。

## 预览产物

本地预览入口：http://localhost:8788/weather/tests/weather-preview.html

交付图：weather-nebula-comparison.png，四种场景真实截图的 HTML 拼版，标明模拟及非车机性能测试。媒体保留在仓库外 p7-weather-media，避免把截图与产品资源混入。

## 可复用框架接入约束

1. 项目 bundled Three r148，传统 script 全局 THREE；优先无额外 Three副本、WebGL1兼容、可固定版本/本地打包的实现。不能假定最新 ESM/WebGPU/React Three Fiber 插件可直接接入。
2. 只允许主 animate() 驱动 update(dt)，必须能关闭框架自己的 RAF、renderer、controls。
3. 复用现有 WebGLRenderer；scene.background 是 HDR，不是透明 canvas 背景。独立 DOM 粒子放 canvas 后会不可见，放前面会遮车。
4. 雨雪是背景层：不加入车模和独立 mirrorScene，不改变车漆/灯光，需深度与屏幕遮罩一起保护透明玻璃和DOM歌词/频谱/歌名/按钮。
5. 框架需支持固定粒子预算、单批次绘制、低帧率dt封顶、dispose/restart、resize/DPR≤2；不要为了80颗雪装配大型物理/后处理系统。
6. 星只晴夜背景天空，无闪电/频闪；几乎静态点阵可能无需重型粒子框架。
7. 考察维护与r148版本兼容是两件事；老库若停止维护应明确说，即使功能刚好适用。
8. 不混淆数据层与视觉框架：天气 API / GPS同意与缓存独立，不因粒子库自带weather demo就复用未知服务或坐标上传。

## 清晰度增强版

用户反馈首版四格天气不明显后，实际重新渲染增强版：alpha目标0.95，雨点尺寸15px、雪6–9px、星3.5–6px（乘受限DPR），雨丝颜色加深。粒子数量、Nebula运动及UI/车辆遮罩未变。输出每场景2000px宽的HTML截图，左侧1164px原尺寸画面，右侧同一截图2倍局部；明确标注增强参数与模拟，不把放大解释为更高原生渲染分辨率。三张分别为 snow-clear.png、rain-clear.png、stars-clear.png，保存在仓库外 p7-weather-media/clear。

## 雨景真实感修正（进行中）

用户指出清晰版深色短雨棒显假并希望屏幕少量挂水。先独立回调空气雨：alpha0.4、亚像素至约1px宽、按种子长短/深浅/速度变化、方向一致、Nebula无阻尼匀速下落及边界回收。雪星增强版参数保持。挂水尚在开源组件许可与实时纹理/单RAF适配评估，不把该空气雨修正称为挂水已实现。

## 玻璃挂水原型

复用 SardineFish/raindrop-fx 固定提交 bae4081bc15815bb094ea040a976dca083bbc3a5 的 MIT compose 折射/高光 shader、法线打包和 PNG（原文件/许可保留）。GLSL1适配至现有Three r148；不是完整raindrop-fx/Zogra框架。12个水珠加12个短痕有界批次，重用原gravity/resistance/velocity-spread思想的简化运动，不含完整碰撞合并。详情vendor/raindrop-fx/UPSTREAM.md。

同主RAF更新，雨切走淡出、隐藏页delta=0、dispose幂等；DOM与车体mask排除。额外RT采样当前3D画面做折射，透明水珠叠加在正常直接渲染结果上，避免改变原车漆。已发现直接整屏后处理会改变透射材质表现，因此本预览保留正常场景输出：代价是额外完整scene render、HDR场景RT+低分辨率法线RT，尚未目标设备性能评估，不可直接上线。没有新WebGL上下文或额外RAF。

云软件WebGL实际编译与画面已验证；101项Node测试通过（新增2项挂水测试及1项雨丝回归）。水珠处背景较平滑，静态折射不如带纹理景物明显；首图是模拟方向评审，不能宣称摄影级验收。

## 雨雪星统一细节迭代

- 雨：12个挂水保持有界；大小层次、非对称UV形状、单滴停滑/阻力周期、速度相关展宽。短痕由实际滑动距离生成、最长42px，停下后1.6秒淡去。降低完整亮环感与折射位移。依然是复用MIT法线/折射模型上的原型，平滑背景的折射可读性有限。
- 折射背景改为最多10Hz缓存更新，正常主画面每帧直绘，避免降频整个车场景。额外完整scene render仍存在，未验证车机性能；快速相机运动时水滴内纹理可能有≤100ms延迟。
- 修复暂停dt=0仍改变展宽、DPR单独变化未resize、非法尺寸/遮罩非有限值、投影无可见角点时无穷遮罩、renderer异常污染共享状态。玻璃运动内部50ms子步，单次总时间上限250ms；5FPS淡入速度可保持一致，长时间后台恢复不突跳。
- 雪：80粒，1.8–6 CSS px关联深度/缓降速度，低幅横漂，避免整层同速落下。
- 星：100粒，1.3–3.6 CSS px，非均匀天空密度、亮度层次、8%低幅慢闪，位置固定、最低NDC y=.3。
- 新增暂停、DPR、非法输入、5FPS、有界长时运行、切换、renderer各阶段错误恢复、折射缓存频率测试；整树109项测试通过。
- 雨动态由云桌面真实截图时间戳组装：约8秒、144帧采样，平均约18fps，视频明确标注模拟/云采样/无GPS。该数值不是页面实际渲染fps或车机性能。没有补帧生成或后期添加雨滴。

## 雾与风示意（独立预览开关）

保留41a14be既有天气设计。新增 tests/weather-concepts.html 与 weatherConcept=baseline|fog|wind-rain|wind-snow，仅用于用户要求的四场景示意图。普通weatherPreview和无参数路径不启用风或雾。

薄雾：Three Fog依世界距离作用于远处地面（near为相机到主体目标距离的1.4倍），近车保留清晰；HDR background不受scene.fog影响，因此用深度测试的天空/地平线雾带代理处理远景，不给DOM或整张画面加白遮罩。该天空雾带是视觉近似，不是体积雾物理模拟，也不进入独立车倒影scene。

风：沿用Nebula雨雪粒子，对雨雪速度添加一致向右的低幅阵风，雨丝/雪粒呈轻倾斜，预算不变。只在wind概念参数下开启；普通雨雪星默认参数保持。静态箭头为示意方向，不是GPS/实时风测量。

Concept validation: 113 Node tests pass. Four scenes checked in cloud Chromium/SwiftShader, not vehicle hardware. Wind preview keeps existing depth and car/UI masks. This is a design mock: directional snow is briefly elongated, and its diameter/opacity is raised only for the wind preview to remain legible in a still image. No physical volume scattering, real wind measurement or GPS service is implied.
