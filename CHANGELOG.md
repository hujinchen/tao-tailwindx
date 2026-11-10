# 更新日志

## 未发布

### 调整

- 生成示例工程的目录名与 `package.json` 包名统一为 `tailwind-uniappx-demo`，默认输出路径为 `demo-output/tailwind-uniappx-demo/`。

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
