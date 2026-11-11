# 更新日志

## 0.5.0（2026-11-11）

### 修复

- 修复动画变量示例在 App 不播放的问题：改用 `@theme` 静态变量 `--animate-demo` 和自定义 `demo-slide` 关键帧，由现有适配在 App 编译时展开为固定动画，避免 HX 5.34 将整个简写变量错误复制到各动画长属性；Web 和小程序保留变量引用，全局主题关键帧同时避免页面作用域改名的问题。App 不支持运行时覆盖此主题动画变量。
- 修复 App 边框宽度工具类在移除 Tailwind 属性注册后缺少默认实线的问题。
- 修复多行预览条件在 HX SDK `5.34.2026102821.2458` 中被误判为 `false`、落入通用文字预览的问题，多项判断移至脚本计算属性；已在不加载本插件的独立进程中复现该 SDK 的条件预判问题。
- 修复 Web 后置清洗误删框架生成的 `uni-page-body`、`body` 规则的问题，保留其中的主题变量及作用域。

### 调整

- 全端将 Tailwind 入口及其导入样式中的 `:root` 统一为 `page`，示例主题同步使用 `page`，平台转换与样式隔离交给 uni-app x；Web 不再强制使用全局 `:root`。这会改变原先 Web 的变量作用范围，`isolated` 页面需自行定义所需变量，具体隔离行为按目标 SDK 验收。
- 扩充 CSS 示例中的 Tailwind 写法，以少量代表值演示命名颜色、容器尺寸和字号，补充透明度、阴影与圆角等级、尺寸和间距组合、字号与行高及变量简写；增加工具类搜索和分批预览，统一操作按钮文字居中，标明 App 与 HarmonyOS 的适用边界。
- 补充 npm 包的 GitHub 仓库信息，发布新版本后包页面可显示 Repository 链接。
- 生成示例工程的目录名与 `package.json` 包名统一为 `tailwind-uniappx-demo`，默认输出路径为 `demo-output/tailwind-uniappx-demo/`。
- CSS 示例的官方说明入口改为各端统一通过独立 `web-view` 页面打开；小程序加载仍受平台域名与调试设置限制。

### 文档

- 修正接入说明中沿用普通 uni-app CLI 的 `src/` 目录写法，统一按 uni-app x 项目根目录配置入口，补充项目准备、`package.json` 初始化与 Vite 配置创建步骤。

## 0.4.0（2026-11-09）

### 调整

- 升级 Tailwind CSS 与其 PostCSS 插件至 4.3.5，picomatch 至 ^4.0.7，PostCSS 至 ^8.5.32。

### 示例与文档

- 扩展示例，提供属性分类、搜索、独立页面及代码与效果对照，补充布局、文本、动画等预览，支持浅色与深色主题。
- 修正示例的平台适用范围与部分无效写法，标注当前 SDK 未保留有效 CSS 声明的值。
- 完善 HBuilder V（HV）与 HBuilderX（HX）的接入、运行及配套 SDK 配置说明。

### 验证范围

已在 Windows 使用 HBuilder V 5.33 配套 SDK（5.33.2026102115-alpha）完成回归及 npm、pnpm 安装检查。

本次依赖升级未验证 macOS 软链接扫描，0.3.0 记录的相关问题是否已解决尚未确认；未验证设备运行及其他 HV/HX SDK 版本。

## 0.3.0（2026-11-08）

### 新增

- 提供 `uniAppXTailwind(options)`、默认导出及构建用 `parseThemeValues(css)`。
- 提供 `tao-tailwindx/tailwind.css` 样式入口，解决 pnpm 严格依赖布局下无法直接解析包内 Tailwind 的问题。

### 调整

- Tailwind CSS v4、PostCSS v8、postcss-scss v4 和 picomatch v4 由包内依赖自动安装，用户只需安装 `tao-tailwindx`。

### 修复

- 将 Tailwind CSS 与其 PostCSS 插件固定为 4.3.3，规避 4.3.5 在 macOS 软链接目录扫描中重复返回文件路径的问题。
- 修正示例与接入文档中的 ESM 配置，通过 `uniModule.default` 调用 `uni()`，避免出现 `uni is not a function`。

### 文档

- 更新接入、配置与样式迁移说明，统一使用 `customAttributes` 表示自定义 class 属性；示例配置采用静态导入与 `defineConfig`。

### 验证范围

已使用 HBuilder V 5.33 配套 SDK 完成回归、Vite watcher/HMR、原生动画 CSS 编译及 npm、pnpm 安装检查。

验证仅覆盖上述 SDK，不代表其他 HV/HX SDK 版本或设备运行已通过验证。
