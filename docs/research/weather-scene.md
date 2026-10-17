# 天气联动研究：细雨、轻雪、晴夜星空

研究日期：2026-10-17。基线：远端 `origin/main`，`46a0203`，应用 1.18.3 / versionCode 21。
独立分支：`research/weather-scene`。本次只新增研究文档，未修改运行时代码、权限、版本号，未实现/发布天气功能，未请求用户位置或调用带用户坐标的天气 API。

## 结论与建议

可行，建议先做离线模拟视觉评审，再接入真实天气。首选 Open-Meteo 适配器：字段贴合需求、不依赖 Google Play services，非商业小规模使用无需 key。必须先确认产品是否涉及商业使用，以及用户是否同意把粗化后的位置发给明确的天气服务商。开源服务端、开放数据和免费托管额度是三件事。

视觉保持氛围层：细小雨丝、慢速小雪点、晴朗夜空少量星点。不要做挡风玻璃水滴、闪电、强风雪、积雪、物理碰撞或改变车漆。天气用于装饰，不能作为道路安全/精确实况依据。后续截图沿用红色车漆；本研究不制作截图。

## 已核查的项目结构

- `app/src/main/AndroidManifest.xml:5-7` 已声明 INTERNET、FINE/COARSE_LOCATION，没有后台定位权限。
- `MainActivity.java:252-259` 启动时会请求定位权限；这是红绿灯功能现有行为，不是天气单独同意流程。清单或历史系统授权不代表已同意发送位置给新服务商。
- `LightSdkController.java:130-150`：没有红绿灯 SDK 凭据时 `start()` 直接返回，定位不会启动。
- `LightSdkController.java:244-302`：GPS 与 network provider 每 1000 ms / 0 m 请求位置，取 last-known；经纬度 E7、速度、方向、精度进入 nativeUpdateGeoPos。该数据流专属于红绿灯，不能让天气依赖其私有凭据或按其高频率请求网络。
- 没有通用 GPS JavaScript bridge。已有 `AndroidAudioBridge` / `AndroidLightBridge`，音频、歌词、灯态走原生推送和前端读取。
- `MainActivity.java:934-967` 生命周期已停/启音频、歌词、红绿灯；天气必须相同生命周期管理，页面未就绪时缓存最新状态，恢复后重新推送，不给销毁的 WebView 回调。
- `index.html:788-828` 现有自动昼夜按设备本地时间固定段：05:30–08:29 和 16:30–18:29 黄昏，08:30–16:29 白天，其余夜晚；每分钟检查。手动切场景关闭时间同步。不是 GPS 日出日落算法。
- `index.html:568-605` 目前确实设置 `scene.background = c.bg`，同时用 HDR IBL。前面“透明画布、移除背景”的老注释不能作为当前行为依据。放在 canvas 下的 CSS 天气会被 HDR 遮住。
- `index.html:1693-1743` 已有主 RAF，统一推进相机、开门、频谱、歌词、倒影和主场景。天气只能接入这个循环，不能另开 RAF/渲染器。
- `car-reflection.js:5-60` 倒影有独立 mirrorScene 与离屏 target（最长边上限 768）；天气不加入该场景、不参与倒影、不给水面/车材质增加 shader 负担。音乐现有四种样式必须全部回归。

以上为静态源码核查；未验证车机定位硬件、天气网络连通性或 GPU 实测性能。

## 数据源与许可

### 首选：Open-Meteo

- 服务端 AGPLv3；天气数据 CC BY 4.0。数据可在满足署名等条件下商业使用，但免费托管 API 限非商业用途，两者不能混同。单纯通过 HTTP 消费 API 不等于复制其 AGPL 服务端代码；若自托管/修改该服务器，需另行核对相应许可义务。[官方代码和许可](https://github.com/open-meteo/open-meteo)、[官方定价/数据许可说明](https://open-meteo.com/en/pricing)
- 免费 API 无 key；商业产品/广告/订阅等应选择商业方案或合规自托管。官方限制：每分钟 600、每小时 5,000、每天 10,000、每月 300,000 calls（terms 的日/小时/分钟文字使用“小于”，工程上保留余量，不顶额运行）。免费服务无 uptime 保证。[条款](https://open-meteo.com/en/terms)
- 商业 endpoint 为 `customer-api.open-meteo.com`，需 API key。不要把付费 key 写进 APK/JS；需后端代理及独立授权的凭据配置。自托管也需承担数据、资源、运维成本，不是免费商用捷径。[定价](https://open-meteo.com/en/pricing)
- 免费 API 日志可能包含 IP 与坐标，官方说明日志在 90 天后删除。数据通过 HTTPS 发送，TLS 不隐藏服务商收到的坐标；代理只是改变接收方，还需披露代理运营者。[隐私条款](https://open-meteo.com/en/terms#privacy)
- 天气展示位置旁保留低干扰、可点击的 Weather data by Open-Meteo.com 署名；设置页同时链接服务商及 CC BY 4.0，说明天气被简化为视觉类别，不暗示供应商背书。官方要求链接紧邻数据展示处，因此不能只藏在关于页。[许可](https://open-meteo.com/en/licence)

### 备选：MET Norway Locationforecast

免费开放数据、可商业再利用，需 CC BY 4.0 署名；不需要 API key，但请求需要可联系的应用 User-Agent，不能拿通用 Dalvik/Java 身份直接调用。不要冒称整个服务端都是开源。[许可](https://api.met.no/doc/License)、[产品文档](https://api.met.no/weatherapi/locationforecast/2.0/documentation)

需遵守 Expires、If-Modified-Since、本地缓存、抖动，坐标最多四位小数。全应用汇总超过 20 req/s 需约定；不使用时不能持续拉取。直连会记录 IP/坐标，官方推荐缓存代理；不能因免费就忽略隐私。无 SLA。[服务条款](https://api.met.no/doc/TermsOfService)

适配成本更高：使用 timeseries + symbol_code 与时段降水，不能直接套 Open-Meteo 的 WMO/is_day 结构；sunrise 需另接产品或本地天文计算。作为商业免费候选值得再评估，但不默认自动切换供应商，避免用户位置被无提示转发到另一机构。[数据模型](https://api.met.no/doc/locationforecast/datamodel)

中国车机网络的连通性、延迟、模型局地准确度，两家均尚未实测；不能声称大陆稳定可用。先用授权的公开城市样例在目标网络测试，再决定发布供应商。

## 最小天气合同与昼夜

建议原生 `WeatherRepository` 负责 HTTP、缓存、位置；`WeatherController` 管生命周期和用户开关。前端仅收到归一化天气，不收到经纬度：

```text
schemaVersion, status, kind, intensity, isDay,
validAtUtcMs, fetchedAtUtcMs, expiresAtUtcMs,
sunriseUtcMs, sunsetUtcMs, timezone,
source, stale, locationPrecision
```

`kind` 为 none/rain/snow/stars；状态区分 disabled、permissionDenied、locating、fresh、stale、unavailable，不能把失败当晴天。JSON 序列化后用受控 evaluateJavascript 推送固定入口，不拼接未转义文本。

Open-Meteo 请求设计（只是模板，未实际请求；LAT/LON 为获授权后的粗化位置）：

```text
https://api.open-meteo.com/v1/forecast?latitude=LAT&longitude=LON&current=weather_code,is_day,precipitation,rain,snowfall,cloud_cover&daily=sunrise,sunset&timezone=auto&timeformat=unixtime&forecast_days=2
```

官方 current 基于天气模型，并非车旁雨量传感器；降水需按返回 interval 理解，雨量 mm 和 snowfall cm 不可混算。is_day 为 0/1；timezone=auto 按坐标返回时区；unix 秒转毫秒后比较，避免把无时区字符串按设备时区解析。跨 DST 的显示用返回 IANA 时区。缺字段/null/未知 code 应安全降级。[字段与时间格式](https://open-meteo.com/en/docs)

建议映射（产品规则，非天气预报精度保证）：

- 51/53/55/56/57/61/63/65/66/67/80/81/82 → rain；冻雨仍是雨，不映射雪
- 71/73/75/77/85/86 → snow
- 95/96/99 → 可用低强度雨氛围，无闪电/冰雹特效；不足以确认降水时保守 none
- 0/1 且 is_day=0 且无降水，才允许 stars；2/3/45/48 无星、无雨雪；未知 code 为 none
- 以 code 为主，降水强度只做封顶的视觉密度微调。概率不等于现在降雨；daily 最严重天气不用于当前画面

第一期保留现有手动场景优先：雨雪不强制换 HDR；星星需天气为晴夜且当前视觉场景 night，手动 daylight 时不显示星。自动场景可在第二期切换为 sunrise/sunset±约 30 分钟黄昏窗口；跨日、极昼极夜/null 日出日落用有效 is_day/原固定时段兜底。缓存的旧 is_day 不能让太阳升起后仍显示星：本地每分钟复核当天日出日落；失效即抑制星星。具体“自动天气是否也接管 HDR”作为产品决定确认，不悄悄改变手动选择。

## 定位、隐私与刷新

- 首次启用天气时明确选择服务商，告知发送“本机粗化的位置 + 网络连接信息”，用户同意后才读取/发送。已有红绿灯授权不能自动延伸到天气供应商。
- 优先 coarse location；Android 12+ 支持用户只给近似位置。无需新后台权限，也不因近似定位反复要求精确定位。[Android 官方](https://developer.android.com/codelabs/approximate-location)
- 原生系统 GPS 是 WGS84；不要把红绿灯 SDK 可能使用的坐标标志/转换结果直接给天气。若后续引入国内地图 SDK，必须核对其 GCJ-02 等坐标系转换，不能混用。
- 建议发出前四舍五入到 0.05° 网格（纬向约 5.6 km、经向随纬度缩短）；这是适合装饰性天气的初始产品方案，边界/山区/沿海可能有误差，需验证。两位小数是约 1.1 km 纬向，不能描述成匿名化。粗化仍是位置数据，仍需同意。不保存精确位置轨迹，不进 logcat/崩溃报告，不把精确坐标发进 JS。
- 天气定位应独立于红绿灯 SDK。可先做独立低频 location provider；如要共享，抽出只读位置总线，保留每个消费者独立同意和生命周期，不调用 nativeUpdateGeoPos 来“激活”天气。
- 前台首次启用取不超过约 10 分钟的已有位置；无可用值时短时请求（如 10–15 秒超时），不持续 1 Hz 定位。coarse-only 不能强行选择要求 fine 的 GPS provider；按权限/可用 provider 降级，兼容无 Google 服务车机。没有位置则 unavailable，不使用 0,0 或静默 IP 定位。
- 基线刷新每 15 分钟 + 0–60 秒抖动；移动超过 10 km 且网格变化才考虑提前刷新，最短间隔 5 分钟。网络只允许一个 in-flight 请求，新位置代数淘汰旧响应，避免返回顺序把天气倒退。
- 以单前台设备计常规上限约 96 次/天；很多安装共享额度/出口时需服务端聚合缓存和容量核算，不能把免费额度当每台设备永久保证。
- 缓存键包括供应商、网格、请求 schema；仅保存最新有限数据和粗网格，禁止历史路线。15 分钟内 fresh；15–60 分钟网络失败可 stale 沿用并轻降强度；超过 60 分钟淡出到 none，保留用户场景。远离旧位置的缓存不能继续冒充当地天气。
- 超时约 8 秒，失败退避 1/5/15 分钟并加抖动；429 尊重 Retry-After，不即时风暴重试；403/许可配置错误停止自动重试并给设置状态。
- 进入后台暂停定位/请求/效果推进；退出或关闭天气取消请求、清除待发坐标，撤销授权清缓存。权限拒绝只提示一次，可选择手动城市（需同意传该城市坐标）或关闭；离线模型/歌词照常工作。

## 渲染方案与预算（待实机测量的工程目标）

推荐 `weather-state.js`（纯状态/映射）与 `weather-effects.js`（Three r148 兼容）分离。效果为独立 Group，挂主场景而非车模/倒影，沿用 renderer 和主 RAF：`weather.update(frameNow, dt, camera, exclusionRects)`。dt 封顶以免后台恢复造成粒子跳跃；禁用时不推进数据。

- 雨：80–160 条细短半透明雨丝，上限 240；1 draw call，低对比冷灰，约 1 CSS px 宽、4–10 px 长，无全屏模糊/水滴贴镜头
- 雪：40–80 颗柔和小点，上限 120；1 draw call，1–3 CSS px，轻缓横漂，禁止大片白块
- 星：50–100 小点，上限 160；上半天空、低亮度，几乎静止，不做高频闪烁/星座连线
- 可用 BufferGeometry + shader 的 seed/time uniform 或 instanced quads；一次性分配 typed arrays，更新 uniform 不逐帧创建对象/texture。雨线需要宽度一致时使用 instanced quad，避免依赖平台不一致的 WebGL lineWidth
- 通常只画一种效果；切换 2–3 秒 crossfade 两组（opacity 总量归一），上限 2 draw calls、360 雨雪粒子；切完禁用旧组，不累积内存。候选状态抖动用稳定窗口抑制，不在每次网络失败时闪切
- 内存增量目标 <1 MB，CPU 更新时间目标 <0.5 ms、GPU 增量目标 <1 ms；这些是验收目标，未测得，不能作为性能承诺。持续超预算先减半密度，再停天气；不牺牲 FFT/歌词/交互
- 正确处理 DPR（当前最高 2）、横竖屏、设置抽屉、安全区与视角归位。雨雪不得成为 raycast/点击目标

### 避免遮住车与 UI

不能简单把粒子当全屏前景。建议首版仅背景天空可见区，保留现有 HDR：粒子在主场景中使用独立材质、depthTest=true、depthWrite=false，不复制进 mirrorScene。另加屏幕空间排除遮罩：投影车模（含开门/舱盖）包围框并留边，时钟、歌词、歌名、频谱、右侧按钮、抽屉矩形留边并羽化。天空区域裁剪，不把远处雨丝画成地面漂浮物。

仅依靠深度测试无法覆盖透明车窗/材质和 DOM 歌词区域，故包围框排除不可省。遮罩参数在相机/布局变化时重算，不逐帧大量 DOM 测量；低频/ResizeObserver 更新 UI rect，车模变化按现有帧信号更新。此保守方案让粒子不绕车身前面，更符合“克制背景”；未来若要全景真实雨雪需单独评审深度/透明合成方案。

若选分离 background scene 多 pass，必须显式处理现有 scene.background 自动清屏与 renderer.autoClear，保存/恢复 renderer 状态并回归倒影；不要仅在 canvas 后新增 DOM 层然后宣称可见。首版优先少 pass 的主场景 Group + 排除区方案。

## 推荐分期与验收

1. 本次：完成研究、方案和隔离分支；不碰业务运行代码。
2. 经确认后：离线模拟原型，内置 dry/rain/snow/clear-night/unknown fixture，复用主 RAF，开关/切换/降级；无需 GPS 或天气网络，也不出正式 APK/发布。
3. 供应商与用途确认后：原生 location + repository + 同意 UI + 归一化 bridge；授权后再做公开城市样例和目标车机网络测试，最后才接用户位置。开发时先用明确标记的公开城市坐标，不读取设备真实位置冒充测试数据。
4. 实机性能与视觉验收后再讨论合并/发布，不自动合并本分支。后续工作基于届时 main 重新同步，避免与黑胶元数据分支冲突。

最低测试矩阵：
- code 雨/冻雨/雪/雷雨/阴/雾/未知；错误 JSON/null/时间单位/过期响应
- 晴夜→日出、多云夜/雨夜无星、跨午夜/时区/DST、极昼极夜、手动 HDR 优先
- 权限拒绝/coarse-only/撤权、定位关闭/超时/旧位置、跨网格抖动/大幅移动
- offline/429/403/timeout、后返回旧请求、缓存恢复/过期、前后台/旋转/销毁回调
- 四种频谱含麦克风真实 FFT、歌词/黑胶 UI 并存、拖拽缩放/开门/归位、倒影、低端设备/热降频
- RAF 数不增加；多次启停/切换无资源泄漏；粒子不覆盖 UI/车透明件；总帧时间与停用天气基线比较

## 待用户决定 / 阻碍

- 这是仅个人非商业使用还是未来会商业分发？决定 Open-Meteo 免费托管是否合适
- 真实天气阶段是否同意向选定供应商发送约 5 km 粗化位置？在确认前禁止真实位置传输
- 是否先做纯模拟视觉原型？当前“研究”不默认授权实施
- 目标车机没有实测环境；GPU、网络可用性、定位来源仍需后续实机验收

本研究未接受新服务合同、创建账户/key、改变用户权限、获取位置、向任一天气 API 传坐标，亦未 push/PR/部署。
