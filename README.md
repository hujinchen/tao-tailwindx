# Tao Tailwind X

面向 **uni-app x Vapor（蒸汽模式）** 的 Tailwind CSS v4 构建插件。

在 Vite 构建阶段编译 Tailwind、处理 `.uvue` 的 `@apply` 与特殊字符 class，并将工具类分配到页面和组件的局部样式。

插件运行在 **Node.js / Vite 构建环境**中。App 使用 Vapor 模式；传统 uni-app、App VDOM 和 Tailwind v3 不在支持范围内。

适配目标为 Web、App Android、App iOS、HarmonyOS Next、微信小程序和支付宝小程序。适配不代表所有 Tailwind 工具类都能在各端运行：CSS 属性、单位和交互行为仍受目标平台限制。各端验收情况以发布版本的更新日志为准。

## 环境要求

- uni-app x，HBuilderV 或 HBuilderX 5.31+；App 启用 Vapor。
- Node.js 22.13+。

## 三步接入

### 1. 安装一个包

在宿主包含 `package.json` 的目录执行：

```bash
pnpm add -D tao-tailwindx
# 或 npm install -D tao-tailwindx
```

Tailwind CSS 等构建依赖随插件自动安装。

### 2. 注册 Vite 插件

在项目的 Vite 配置中注册，**必须放在 uni 插件前面**。使用 `vite.config.mjs`，或在项目 `package.json` 中设置 `"type": "module"` 后使用 `vite.config.js`：

```js
import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { uniAppXTailwind } from 'tao-tailwindx'
import { fileURLToPath } from 'node:url'

const uni = uniModule.default
const entry = fileURLToPath(new URL('./tailwind.css', import.meta.url))

export default defineConfig({
	plugins: [uniAppXTailwind({ entry }), uni()]
})
```

CLI 项目只需把 `entry` 调整为 `./src/tailwind.css`，包名导入不变。
已有 Vite 配置只需合并导入和插件注册，保留项目的其他配置。

`uniAppXTailwind()` 返回插件数组，Vite 支持直接嵌套使用。
配套 SDK 的 `@dcloudio/vite-plugin-uni` 使用 CommonJS 导出，ESM 配置先通过 `uniModule.default` 取出插件函数，再调用 `uni()`。
`"type": "module"` 让工程内的 `.js` 按 ESM 加载；使用 `vite.config.mjs` 时可以省略它。保留 `vite.config.js` 时不能直接删除，否则当前 Vite 会拒绝静态导入 ESM 包 `tao-tailwindx`。

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

需要扫描其他组件模块或共享脚本时，按项目实际目录增加 `@source`。例如项目将组件模块放在 `uni_modules/ui-kit`、共享 class 表放在 `utils`：

```css
@source './uni_modules/ui-kit/**/*.{uvue,ts,uts}';
@source './utils/**/*.{ts,uts}';
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
	customAttributes: { 'app-dialog': ['content-class'] },
	colorVariables: ['--brand']
})
```

| 配置                   | 默认值  | 用途                                                 |
| ---------------------- | ------- | ---------------------------------------------------- |
| `entry`                | 未配置  | Tailwind 入口绝对路径，接入时显式提供                |
| `componentLocalStyles` | `true`  | 页面、组件及其已扫描脚本依赖的工具类进入对应局部样式 |
| `customAttributes`     | `{}`    | 声明额外的 class 属性，如 `content-class`            |
| `strict`               | `true`  | 过滤不符合 Vapor 约束的复杂选择器                    |
| `colorVariables`       | `[]`    | 显式选择需要生成 RGB 通道的自定义颜色变量            |
| `themeValues`          | 关闭    | 按指定 CSS 文件导出主题变量数据                      |
| `debug`                | `false` | 输出构建诊断信息                                     |

所有选项、默认值和处理边界见[配置与使用说明](./CONFIGURATION.md)。

## 局部样式与公共样式

默认按文件生成局部工具类。共享 class 表要进入 `@source` 扫描范围，并由使用它的 SFC 静态导入；共享次数不会触发全局提升。

真正需要全局保留的工具类，在公共入口显式声明：

```css
@source inline('p-16 text-brand');
```

`@source './pages/**/*.uvue'` 只控制扫描范围，不会把页面工具类变成全局。
运行时拼接的 `'p-' + size` 不能推导出完整候选，应改为有限的完整类名映射，或显式声明候选。

自定义 class 属性通过 `customAttributes` 声明；普通 `class` 和 `hover-class` 无需额外配置。类名转换后，样式仍需遵守组件的样式隔离与 `externalClasses` 契约。
详细规则见[样式生成与隔离](./STYLE-GENERATION.md)。

## 插件结构

```text
tao-tailwindx/
├── package.json          # npm 名称、版本、依赖与公开入口
├── index.mjs             # 对外构建入口：uniAppXTailwind
├── tailwind.css          # 公开 CSS 入口，加载内部 Tailwind 依赖
├── src/                  # 构建处理与按需注入的 class 辅助代码
├── README.md             # 快速接入
├── CONFIGURATION.md      # 配置、使用方式和平台边界
├── STYLE-GENERATION.md   # 局部与全局归属、隔离规则
├── LICENSE               # MIT 许可
├── CHANGELOG.md          # 版本更新日志
├── test/                 # 插件回归；demo-template/ 为示例工程模板
└── scripts/              # npm 安装与发布内容验收
```

`test/`、`scripts/` 和作者用 `PUBLISHING.md` 不进入 npm 发布包。维护者可在源码项目中查看 PUBLISHING.md。

在源码工程执行 `pnpm run test:package`，会以 `test/demo-template/` 为模板生成示例，并安装当前源码打包的插件。默认输出到固定目录 `demo-output/demo-app/`，用 HBuilder V 或 HBuilderX 打开该工程即可运行。每次运行会清空并重新生成此目录；需要保留的示例修改应放在模板中。自定义输出位置见源码工程中的 `PUBLISHING.md`。

## 常见问题

- **Sass 报 `expected ";"`**：检查 `uniAppXTailwind()` 是否位于 uni 插件之前。
- **工具类无效果**：检查源码是否在 `@source` 内、类名是否完整、是否导入同一入口，以及目标平台是否支持该 CSS 属性或单位。
- **自定义 class 属性样式无效**：检查 `customAttributes` 配置、工具类归属和组件隔离。
- **`Cannot find package`**：检查是否在宿主安装了 `tao-tailwindx`；CSS 使用 `tao-tailwindx/tailwind.css`，随后重启构建。
- **默认间距或字号在 App 异常**：检查 Tailwind 的 `rem` 默认值；按项目需要配置 `@theme` 或使用 `px` / `rpx` 任意值。

本插件在本地执行构建，不含广告，不主动采集或上传用户数据，不申请 App 系统权限。启用 `themeValues` 会写入配置指定的文件。
许可见[LICENSE](./LICENSE)。
