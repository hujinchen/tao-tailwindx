## 0.3.0（2026-11-08）

- 提供 `uniAppXTailwind(options)`、默认导出及构建用 `parseThemeValues(css)`。
- Tailwind CSS v4、PostCSS v8、postcss-scss v4 和 picomatch v4 由包内依赖自动安装，用户只安装 `tao-tailwindx`。
- Tailwind 与其 PostCSS 插件固定为已验证的 4.3.3，避免 4.3.5 在 macOS 软链接目录扫描中重复返回文件路径。
- 提供 `tao-tailwindx/tailwind.css`，解决 pnpm 严格依赖布局下宿主无法直接解析内部 Tailwind 的问题。
- 保留局部工具类生成、显式全局声明、`@apply`、class 安全转换、CSS 适配与可选主题数据导出能力。
- 精简接入、配置、样式迁移与维护文档，统一使用 `customAttributes` 说明自定义 class 属性。
- 接入文档与测试宿主统一使用顶部静态导入和常规 `defineConfig` 配置；发布检查验证安装后的静态导入，README 环境要求仅列必要条件。
- ESM 配置通过 `uni.default()` 注册配套 SDK 的 uni 插件，避免 CommonJS 导出互操作导致 `uni is not a function`。

### 验证边界

使用 HBuilder V 5.33 配套 SDK 执行 246 项 Node 回归，全部通过，无失败或跳过，包含真实 Vite watcher/HMR 和原生动画 CSS 编译检查。npm、pnpm 的实际 tarball 单包安装、静态导入和六端插件样式处理检查通过。

Node 回归与打包安装检查不代替设备验收。完整 Vite watcher 与原生 CSS 编译测试需要配置 HBuilder V SDK 路径，维护者可查看源码项目中的 PUBLISHING.md。
