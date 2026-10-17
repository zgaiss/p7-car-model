---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 82be59fe8c0c454d99e3059d89db290a_4e042038c52d11f19063525400393706
    ReservedCode1: r9Ve0XGckj3lTKTM/NQHNrfF3H8JssnyRROOwqHGLcD/PF0Qh+7lwo/zsGEpORJpbzgkLS6TiGrvXGsGGA/hcb4RlTO8UGR1V+5wb1NMWmhoEAXshhI20DOCZ1pptTU9zQf2DV1U5C+skdUwCXespmU24xrERKOIL4/WHuhEW7nih+vs8PQln8zPH+c=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 82be59fe8c0c454d99e3059d89db290a_4e042038c52d11f19063525400393706
    ReservedCode2: r9Ve0XGckj3lTKTM/NQHNrfF3H8JssnyRROOwqHGLcD/PF0Qh+7lwo/zsGEpORJpbzgkLS6TiGrvXGsGGA/hcb4RlTO8UGR1V+5wb1NMWmhoEAXshhI20DOCZ1pptTU9zQf2DV1U5C+skdUwCXespmU24xrERKOIL4/WHuhEW7nih+vs8PQln8zPH+c=
---
# P7 Car Model · P7 SHOW

基于 Android WebView 与 Three.js 的小鹏 P7 交互式 3D 车模展示应用，面向 Android 手机与兼容车机屏幕。

本仓库初始源码来自 `P7Show-source-v1.38(1).zip`。压缩包名称中的 **v1.38** 是来源标记；当前 `app/build.gradle` 的应用版本仍为 **1.18**（`versionCode 18`），两者尚未统一。

## 功能

- **3D 车模**：拖拽旋转、双指捏合／滚轮缩放，使用本地 GLB 模型及 Three.js 资源。
- **视角归位**：约 5 秒无操作后平滑归位，支持默认视角与当前会话内的自定义视角。
- **场景与车灯**：白天、黄昏、夜间 HDR 环境切换，可按系统时间自动切换；支持车灯开关及双击车模切换车灯。
- **时钟与设置**：显示时间、日期和星期；点击左上角时钟打开设置面板。
- **音频可视化**：麦克风采样、FFT 与 64 柱频谱，支持关闭显示；车机播放中无有效麦克风输入时会显示程序生成的波浪动画。
- **车机歌词接入**：通过小鹏车机媒体 Binder 接口读取歌曲、歌手、LRC、进度与播放状态，在 3D 场景中展示歌词。
- **红绿灯接入代码**：包含定位、原生 SDK 灯态轮询和微信扫码绑定界面，实际可用性取决于 SDK 授权、服务端和设备环境。

## 开发环境与构建

| 项目 | 当前配置 |
| --- | --- |
| 应用名 | `P7 SHOW` |
| applicationId / namespace | `com.xpeng.p7show` |
| Activity 源码包 | `com.show.p7` |
| Android SDK | `minSdk 24` / `compileSdk 36` / `targetSdk 36` |
| Java | 源码与目标级别为 Java 17；建议使用 JDK 17 |
| 构建工具 | Gradle Wrapper 8.9 / Android Gradle Plugin 8.7.3 |
| 渲染 | 系统 Android WebView、Three.js、GLTFLoader、OrbitControls、RGBELoader |

安装 Android SDK Platform 36，并配置 `ANDROID_HOME`，或由 Android Studio 在根目录 `local.properties` 中设置 `sdk.dir`。首次构建需要联网下载 Gradle 和 Android 构建工具；仓库已配置阿里云镜像、Google 与 Maven Central 等依赖源。应用模块未声明额外的 Maven 库依赖。

在仓库根目录执行：

```powershell
# Windows PowerShell
.\gradlew.bat assembleDebug
```

```sh
# macOS / Linux
sh ./gradlew assembleDebug
```

Debug APK 路径：`app/build/outputs/apk/debug/app-debug.apk`。也可以直接使用 Android Studio 打开仓库根目录构建。Release 构建尚未配置发布签名。

## 权限与可选接入

Android 清单声明了以下权限：

| 权限 | 用途 |
| --- | --- |
| `INTERNET` | 红绿灯 SDK 与扫码激活服务访问网络 |
| `RECORD_AUDIO` | 麦克风采样，用于频谱动画 |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | 获取位置并交给红绿灯 SDK |
| `com.xiaopeng.xuimanager.permission.XUI_MEDIACENTER` | 访问兼容小鹏车机的媒体服务 |

麦克风和定位权限会在运行时申请。基础模型、渲染脚本与 HDR 环境文件均打包在 `assets/` 中，本地 3D 展示无需外部 CDN；红绿灯相关功能需要网络。歌词接口依赖对应车机服务与权限，普通手机或模拟器可能只显示“暂无歌词”。

### 红绿灯 SDK 配置

原生接入位于 `LightSdkController.java`，配套库位于 `app/src/main/jniLibs/`，包含 `arm64-v8a`、`armeabi-v7a`、`armeabi`、`x86` 和 `x86_64` 目录。仓库使用已有 `.so` 文件，未包含这些原生库的源码。

如需使用此功能，在根目录的 **本地** `local.properties` 中加入自己取得的有效授权配置：

```properties
# 保留 Android Studio 已生成的 sdk.dir 配置
p7.light.sdkKey=YOUR_SDK_KEY
p7.light.accessKey=YOUR_ACCESS_KEY
```

这两个值在构建时写入 `BuildConfig`。`local.properties` 已被 `.gitignore` 排除，请勿提交实际凭据。未配置时跳过 SDK 初始化与激活请求，基础 3D 展示可继续使用。客户端构建产物中的配置值可以被提取，本地忽略文件不能提供运行时保密性。

接入当前指向 `light.mojoxing.com` 的服务，涉及位置、设备标识与扫码绑定信息；服务端可用性和激活结果未经本仓库验证。仅填写配置并不保证能获取真实路口读秒，源码中的坐标类型与系统定位来源也需结合实际设备核对。

## 目录结构

```text
.
├── README.md
├── build.gradle / settings.gradle / gradle.properties
├── gradlew / gradlew.bat / gradle/wrapper/
└── app/
    ├── build.gradle / proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/show/p7/
        │   ├── MainActivity.java        # WebView、音频采样、车机歌词桥接
        │   └── LightSdkController.java  # 定位、红绿灯 SDK、扫码绑定
        ├── java/com/xlsyn/light/        # 原生 SDK Java 接口与数据类型
        ├── jniLibs/                     # 各 ABI 的 liblight.so
        ├── assets/
        │   ├── index.html              # 主要界面与 3D 场景逻辑
        │   ├── three.min.js / *Loader.js / OrbitControls.js
        │   ├── model/                  # 当前加载 XPP7_Model_v4.glb，另保留 v1
        │   ├── background/             # HDR 环境资源
        │   └── index.html.bak_*        # 随原始压缩包保留的历史备份
        └── res/                        # 布局、主题、字符串与应用图标
```

## 当前状态与素材说明

- 此次整理为源码导入与仓库文档补充，未提供经过验证的 APK，也未完成 Android 真机、车机接口或 SDK 联调验证。
- 当前设置面板提供三种场景；资源目录中另保留了晨间等 HDR 文件。旧版说明提到的车漆换色按钮不在当前界面中。
- 压缩包原 README 将模型标注为 **Sketchfab · supercarmodels · 2022 XPeng P7 · CC-BY-4.0**。这里保留原始署名信息；当前 v4 模型、HDR 与 SDK 的具体来源和再分发授权仍需按各自原始素材说明核实。
- 仓库尚未添加项目整体的开源许可证。模型的原始许可声明不代表全部代码、素材与原生 SDK 使用同一许可。

## 车门 / 舱盖动画与车漆

- 单击四个车门、前舱盖或后备箱盖可独立开关；右侧的六个按钮也可操作远侧或被遮挡的部件。
- 再次点击可中途反向，拖拽旋转、长按和双指缩放不会开门。双击车身仍切换车灯（单击约延迟 300 ms，以区分双击）。
- 点击时钟进入设置，可选六种车漆预设、系统颜色选择器或 HEX 色值。颜色即时预览并在本机保存，支持恢复模型原色。只改变车漆，不改变玻璃、轮胎、灯具或内饰。
- 六组铰链由现有 GLB 离线拆分生成，原始 `XPP7_Model_v4.glb` 保留不动。转轴和角度是展示近似，并非厂家机械数据；前舱盖打开的是现有模型结构，不代表新增了真实前备箱收纳空间。

开发检查：

```sh
node --test tests/*.test.*
# 离线模型生成需已有 Python、NumPy 与 SciPy；应用运行无需 Python
python tools/prepare_openings.py
# 可用浏览器打开测试页（需要 WebGL）
python3 -m http.server 8768
# http://127.0.0.1:8768/tests/browser-openings.html
```

测试页通过 `?qa=1` 显式启用场景检查接口，正常启动不暴露场景句柄。Android APK 和真机表现仍需按上方 Android 构建流程验证；桌面 WebGL 检查不能替代车机实测。
