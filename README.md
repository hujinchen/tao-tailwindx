# Tao Tailwind X

面向 **uni-app x Vapor** 的 Tailwind CSS v4 构建插件。npm 包名为 `tao-tailwindx`。

在 Vite 构建阶段编译 Tailwind、处理 `.uvue` 的 `@apply` 与特殊字符 class，并将工具类分配到页面和组件的局部样式。

## 目标与适用范围

- 用一份 Tailwind 入口管理工具类、主题变量与公共样式。
- 页面和组件默认按文件生成局部工具类，公共工具类由入口显式声明。
- 让节点绑定的 class 与生成的 CSS 使用一致的安全名称，保留脚本中的原始数据。
- 在 uni-app x 编译流程中处理 Tailwind 输出与原生 CSS 的差异。
- 有需要时，将主题 CSS 变量导出为 TypeScript 数据。

这是运行在 **Node.js / Vite 构建环境**中的普通 JavaScript 插件，通过 npm 分发。App 使用 Vapor 模式；传统 uni-app、App VDOM 和 Tailwind v3 不在支持范围内。

适配目标为 Web、App Android、App iOS、HarmonyOS Next、微信小程序和支付宝小程序。适配不代表所有 Tailwind 工具类都能在各端运行：CSS 属性、单位和交互行为仍受目标平台限制。各端验收情况以发布版本的更新日志为准。

## 环境要求

- uni-app x / HBuilderX 5.31+；App 启用 Vapor。HBuilder V 使用满足版本要求的配套 SDK。
- Node.js 22.13+，宿主支持项目级 `vite.config.js`。首次接入或升级后重启构建。
- Tailwind CSS v4、PostCSS v8、postcss-scss v4 和 picomatch v4 由插件自动安装，无需逐个安装。Vite 与 uni-app 编译器沿用宿主工程或 IDE。

## 三步接入

### 1. 安装一个包

在宿主包含 `package.json` 的目录执行：

```bash
pnpm add -D tao-tailwindx
# 或 npm install -D tao-tailwindx
```

### 2. 注册 Vite 插件

在项目的 `vite.config.js` 中注册，**必须放在 `uni()` 前面**：

```js
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./tailwind.css', import.meta.url))

export default defineConfig(async () => {
	const { uniAppXTailwind } = await import('tao-tailwindx')
	return {
		plugins: [uniAppXTailwind({ entry }), uni()]
	}
})
```

CLI 项目只需把 `entry` 调整为 `./src/tailwind.css`，包名导入不变。
已有 Vite 配置只需合并导入和插件注册，保留项目的其他配置。

插件提供 ESM 入口；异步导入也适用于以 CommonJS 加载 Vite 配置的宿主。
`uniAppXTailwind()` 返回插件数组，Vite 支持直接嵌套使用。

### 3. 创建并引入 Tailwind 入口

在 `App.uvue` 同级创建 `tailwind.css`：

```css
@import 'tao-tailwindx/tailwind.css' source(none);

@source './App.uvue';
@source './pages/**/*.{uvue,ts,uts}';
@source './components/**/*.{uvue,ts,uts}';

@theme inline {
	--spacing: 1px;
	--color-brand: var(--brand);
}

:root {
	--brand: #2563eb;
}
```

这个公开 CSS 入口从插件内部加载 Tailwind，适用于 npm 和 pnpm 的依赖布局。单包接入请使用它；直接导入 `tailwindcss` 仍要求宿主单独安装 Tailwind。

需要扫描其他组件或共享脚本时，按实际目录增加 `@source`；例如使用 Tao-Unix 时添加：

```css
@source './uni_modules/tao-unix/**/*.{uvue,ts}';
```

示例将间距基准设为 `1px`，因此 `p-16` 是 `16px`。Tailwind 默认的部分间距、字号和圆角使用 `rem`，本插件保留原单位；App 不支持的单位需通过 `@theme` 或任意值改为该平台支持的单位。

在 `App.uvue` 的全局样式中导入同一个入口：

```html
<style>
	@import './tailwind.css';
</style>
```

现在可以在页面使用完整工具类，并在局部样式中使用 `@apply`：

```html
<template>
	<view class="flex-row items-center p-16 bg-brand rounded-[12px]">
		<text class="text-[14px] text-white">Tao Tailwind X</text>
	</view>
</template>

<style lang="scss">
	.demo-label {
		@apply text-[14px] text-brand;
	}
</style>
```

不要在 `main.ts`、页面或组件脚本中导入 Node 构建入口。动态 class 的转换辅助函数由插件按需注入，业务代码无需手动导入。

## 常用配置

```js
uniAppXTailwind({
	entry,
	componentLocalStyles: true,
	customAttributes: { '*': ['pt'] },
	colorVariables: ['--brand']
})
```

| 配置                   | 默认值  | 用途                                                 |
| ---------------------- | ------- | ---------------------------------------------------- |
| `entry`                | 未配置  | Tailwind 入口绝对路径，接入时显式提供                |
| `componentLocalStyles` | `true`  | 页面、组件及其已扫描脚本依赖的工具类进入对应局部样式 |
| `customAttributes`     | `{}`    | 声明额外的 class 属性，如 PT、`content-class`        |
| `strict`               | `true`  | 过滤不符合 Vapor 约束的复杂选择器                    |
| `colorVariables`       | `[]`    | 显式选择需要生成 RGB 通道的自定义颜色变量            |
| `themeValues`          | 关闭    | 按指定 CSS 文件导出主题变量数据                      |
| `debug`                | `false` | 输出构建诊断信息                                     |

所有选项、默认值和处理边界见[配置与工作原理](./CONFIGURATION.md)。

## 局部样式、公共样式与 PT

默认按文件生成局部工具类。共享 class 表要进入 `@source` 扫描范围，并由使用它的 SFC 静态导入；共享次数不会触发全局提升。

真正需要全局保留的工具类，在公共入口显式声明：

```css
@source inline('p-16 text-brand');
```

`@source './pages/**/*.uvue'` 只控制扫描范围，不会把页面工具类变成全局。
运行时拼接的 `'p-' + size` 不能推导出完整候选，应改为有限的完整类名映射，或显式声明候选。

使用 PT 等自定义样式属性时配置 `customAttributes`。这只负责 class 转换，仍需遵守组件的样式隔离和 PT / `externalClasses` 契约。
详细规则见[样式生成、隔离与迁移指南](./STYLE-GENERATION.md)。

## 插件结构

```text
tao-tailwindx/
├── package.json          # npm 名称、版本、依赖与公开入口
├── index.mjs             # 对外构建入口：uniAppXTailwind
├── tailwind.css          # 公开 CSS 入口，加载内部 Tailwind 依赖
├── src/                  # 构建处理与按需注入的 class 辅助代码
├── README.md             # 快速接入
├── CONFIGURATION.md      # 完整配置、工作原理和平台边界
├── STYLE-GENERATION.md   # 局部与全局归属、隔离和迁移规则
├── LICENSE               # MIT 许可
├── CHANGELOG.md          # 版本更新日志
├── test/                 # 插件回归与独立宿主夹具
└── scripts/              # npm 安装与发布内容验收
```

插件不包含业务组件、页面、静态图片或 uniCloud 资源，也不自动修改宿主的配置文件。
`test/`、`scripts/` 和作者用 `PUBLISHING.md` 不进入 npm 发布包。维护者可在源码项目中查看 PUBLISHING.md。

## 常见问题

- **Sass 报 `expected ";"`**：检查 `uniAppXTailwind()` 是否位于 `uni()` 之前。
- **工具类无效果**：检查源码是否在 `@source` 内、类名是否完整、是否导入同一入口，以及目标平台是否支持该 CSS 属性或单位。
- **PT 能转换但样式没有作用**：检查工具类归属和组件隔离；按组件契约配置公共样式或 `externalClasses`。
- **`Cannot find package`**：检查是否在宿主安装了 `tao-tailwindx`；CSS 使用 `tao-tailwindx/tailwind.css`，随后重启构建。
- **默认间距或字号在 App 异常**：检查 Tailwind 的 `rem` 默认值；按项目需要配置 `@theme` 或使用 `px` / `rpx` 任意值。

本插件在本地执行构建，不含广告，不主动采集或上传用户数据，不申请 App 系统权限。启用 `themeValues` 会写入配置指定的文件。
许可见[LICENSE](./LICENSE)。
