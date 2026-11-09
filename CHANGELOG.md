# 更新日志

## 未发布（2026-11-09）

- `fix`：修复打包检查在 Windows 下误将 npm shell 启动文件交给 Node 执行、pnpm 启动失败和路径分隔符校验错误，保留 macOS 运行方式，并补充 PowerShell 用法。
- `feat`：扩展示例模板为 110 项官方 CSS 属性、636 个 Tailwind 写法，提供八类导航、搜索、属性独立地址、代码与效果对照。
- `feat`：增加多行 Flex、边框与圆角、尺寸与间距、文本布局、事件穿透、可控制动画和 Web 滚动时间轴等实际预览，统一浅色与深色主题。
- `fix`：按平台限制示例候选，对当前 HBuilder V SDK 未保留有效声明的值明确标注；使用长度类型提示和 `transform` 任意属性避免演示无效转换。
- `test`：增加六端示例 CSS 生成与配套 SDK 原生样式编译检查，生成工程保留模板的使用说明。

## 0.3.0（2026-11-08）

- `feat`：提供 `uniAppXTailwind(options)`、默认导出及构建用 `parseThemeValues(css)`。
- `build`：Tailwind CSS v4、PostCSS v8、postcss-scss v4 和 picomatch v4 由包内依赖自动安装，用户只安装 `tao-tailwindx`。
- `fix`：Tailwind 与其 PostCSS 插件固定为已验证的 4.3.3，避免 4.3.5 在 macOS 软链接目录扫描中重复返回文件路径。
- `feat`：提供 `tao-tailwindx/tailwind.css`，解决 pnpm 严格依赖布局下宿主无法直接解析内部 Tailwind 的问题。
- `chore`：保留局部工具类生成、显式全局声明、`@apply`、class 安全转换、CSS 适配与可选主题数据导出能力。
- `docs`：精简接入、配置、样式迁移与维护文档，统一使用 `customAttributes` 说明自定义 class 属性。
- `docs`：接入文档与测试宿主统一使用顶部静态导入和常规 `defineConfig` 配置；发布检查验证安装后的静态导入，README 环境要求仅列必要条件。
- `fix`：示例与接入文档的 ESM 配置先取出 `uniModule.default`，再直接调用 `uni()`，避免 CommonJS 导出互操作导致 `uni is not a function`；增加配套 SDK 的真实 Vite 配置加载回归。
- `build`：示例工程固定生成到 `demo-output/demo-app/`，每次清空并重新生成，保留自定义输出父目录配置，并排除 Git、格式检查和 npm 发布。
- `refactor`：示例模板目录命名为 `test/demo-template/`，生成脚本命名为 `scripts/generate-demo.mjs`。

### 验证边界

使用 HBuilder V 5.33 配套 SDK 执行 247 项 Node 回归，全部通过，无失败或跳过，包含示例 Vite 配置加载、真实 Vite watcher/HMR 和原生动画 CSS 编译检查。npm、pnpm 的实际 tarball 单包安装、静态导入和六端插件样式处理检查通过。

Node 回归与打包安装检查不代替设备验收。完整 Vite watcher 与原生 CSS 编译测试需要配置 HBuilder V SDK 路径，维护者可查看源码项目中的 PUBLISHING.md。
