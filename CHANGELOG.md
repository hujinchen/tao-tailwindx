## 0.3.0（2026-11-08）

- 以 Tao Tailwind X 名称独立维护 npm 包 `tao-tailwindx`，源码、测试、示例及发布检查均放在本项目。
- 提供 `uniAppXTailwind(options)`、默认导出及构建用 `parseThemeValues(css)`；插件核心实现保持不变。
- Tailwind CSS v4、PostCSS v8、postcss-scss v4 和 picomatch v4 由包内依赖自动安装，用户只安装 `tao-tailwindx`。
- Tailwind 与其 PostCSS 插件固定为已验证的 4.3.3，避免 4.3.5 在 macOS 软链接目录扫描中重复返回文件路径。
- 提供 `tao-tailwindx/tailwind.css`，解决 pnpm 严格依赖布局下宿主无法直接解析内部 Tailwind 的问题。
- 保留局部工具类生成、显式全局声明、`@apply`、class 安全转换、CSS 适配与可选主题数据导出能力。

### 从原源码目录迁移

安装 `tao-tailwindx` 后，将构建导入改为包名 `tao-tailwindx`；CSS 的 `@import 'tailwindcss'` 改为 `@import 'tao-tailwindx/tailwind.css'`。插件选项保持不变。
从 0.2.x 升级时，还需按[样式生成、隔离与迁移指南](./STYLE-GENERATION.md)处理局部样式默认生成与显式全局声明。

### 验证边界

独立插件 246 项 Node 回归全部通过，无跳过项；包含使用 HBuilder V SDK 的 Vite watcher 与原生 CSS 编译检查。npm、pnpm 的实际 tarball 单包安装和六端插件样式处理检查通过。Tao-Unix 通过包名接入后的 Web 编译及 App、Button、Calendar 样式模块加载通过。

Node 回归与打包安装检查不代替设备验收。完整 Vite watcher 与原生 CSS 编译测试需要配置 HBuilder V SDK 路径，维护者可查看源码项目中的 PUBLISHING.md。
