# Tao Tailwind X 配置与工作原理

插件将 Tailwind v4 生成的 CSS 转换为更适合 uni-app x 原生渲染器的形式，同时处理
`.uvue` 中 Tailwind 重要号 class、Vue SFC 的 `@apply`，以及 App 全局 Tailwind 样式入口。
Tailwind 本身由 `@tailwindcss/postcss` 编译，本插件负责编译流程和 Vapor 兼容处理。

## 解决的问题

uni-app x Vapor 对 CSS 有一些区别和限制：

- 共享样式应尽量使用 class 选择器，不能依赖标签、后代、子级、兄弟或复杂伪选择器。
- 部分 Tailwind v4 输出包含当前 5.31 Vapor 不支持的 `@property`、CSS cascade layer、
  `color-mix()` 和 oklab 颜色。
- HBuilderX 5.31+ App Vapor 的 Android、iOS、HarmonyOS 已支持 `calc()`；表达式类型和属性范围仍有限制，见下文。
- 原生端不适合直接使用 Tailwind 的 Preflight 和 `content` 声明。
- Tailwind 的重要号 class，例如 `p-0!`，会生成包含转义符的 CSS selector，而 Vapor 对这类
  selector 的支持有限。

本插件在 Vite 编译阶段处理这些差异，目标是让同一套 Tailwind class 能够用于 Web、App
Android、App iOS、HarmonyOS Next 和其他 uni-app x 目标端。

## 功能概览

- 使用 Tailwind CSS v4 的 `@tailwindcss/postcss` 编译工具类。
- 处理 Vue SFC / `.uvue` 中的 `@apply`。
- 在 `.uvue` 的 class 绑定处转换重要号与特殊字符，脚本中的原始字符串保持不变。
- 清洗 Tailwind 输出，只保留符合 Vapor 约束的 class-only selector（可配置）。
- 保留 Vapor 5.31+ 支持的 `@keyframes`、`animation` 系列；`@apply animate-*` 同时保留关键帧定义。
- 移除 `content`、`resize`、`@property` 和不适合原生端的 `display: block/grid/table`。
- 展开 `@layer`，避免把 CSS cascade layer 交给 Vapor 编译器。
- 全端保留 `@media (prefers-color-scheme: light/dark)` 主题规则；App 仍移除响应式断点等其他媒体查询，Web 和小程序保留。
- 将 Tailwind 生成的 `:root` 变量作用域按平台改写：Web 使用标准 `:root`，原生端和小程序使用
  uni-app x 的 `page` 标签选择器。
- 保留 `rem` 原单位，不提供单位兼容补齐；App 对 Tailwind 生成的可完全静态求值且保持属性语义的 `calc()` 做编译期折叠。
- 转换 Tailwind 生成的百分比 opacity、`color-mix()` 和 oklab 颜色；calc 的动态变量与无法安全求值的表达式保留。
- 字重变量保留运行时引用，遵循根、组件和主题作用域，不以全文件最后一次声明的值替换。
- 所有平台关闭 Tailwind CSS 优化，保留四边定位和 `to right` 等合法展开结果；Web 原生声明、变量、媒体查询与特性查询透传。
- Web 和小程序保留媒体查询；App 仅保留官方支持的明暗主题媒体查询。
- App 展开 Tailwind backdrop 工具类的规则内空回退变量链；直接书写 `backdrop-filter: blur(8px)` 时原样保留。
- 按配置解析 `class`、`hover-class`、自定义 class 属性和对象属性中的动态 class 值。
- 按显式配置将主题 CSS 变量导出为纯 TypeScript 数据，不生成运行时解析函数。
- 在输出 CSS 前移除明显非法的占位值，例如 `background-color: #...`；合法的任意值仍会保留。

## 安装与使用

用户只安装一个包，Tailwind CSS v4、PostCSS v8、postcss-scss v4 与 picomatch v4 由插件的 `dependencies` 自动安装：

```bash
pnpm add -D tao-tailwindx
```

Vite 与 uni-app 编译器由宿主工程或 IDE 提供。

在 ESM Vite 配置中注册插件（`vite.config.mjs`，或设置 `"type": "module"` 后的 `vite.config.js`）：

```js
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { uniAppXTailwind } from 'tao-tailwindx'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./tailwind.css', import.meta.url))

export default defineConfig({
	plugins: [uniAppXTailwind({ entry }), uni.default()]
})
```

CLI 项目请把 Tailwind 入口调整到 `src/` 下，包名导入不变。完整步骤见[快速接入](./README.md)。
配套 SDK 的 `@dcloudio/vite-plugin-uni` 使用 CommonJS 导出，ESM 配置通过 `uni.default()` 注册。

插件同步返回一组 Vite plugins。Vite 原生支持嵌套插件数组，因此可以像普通 Vite 插件一样
直接注册，不需要展开运算符。插件内部通过 `enforce: 'pre'` 和 `enforce: 'post'`
控制处理阶段，但同为 `pre` 的插件仍受注册顺序影响。必须将 `uniAppXTailwind()` 放在
uni 插件前面，让 `@apply` 先展开为 CSS；否则 Sass 会先解析 `p-12!` 等 Tailwind 语法，
触发 `expected ";"` 编译错误。

## Tailwind 入口

在宿主项目根目录创建 `tailwind.css`，使用 Tailwind v4 完整入口并显式声明扫描范围：

```css
@import 'tao-tailwindx/tailwind.css' source(none);

@source './App.uvue';
@source './main.ts';
@source './pages/**/*.{ts,uts,uvue}';
@source './components/**/*.{ts,uts,uvue}';

@theme inline {
	--color-brand: var(--brand);
}

:root {
	--brand: #2563eb;
}
```

公开 CSS 入口在插件内部解析 Tailwind，避免 pnpm 严格依赖布局下宿主找不到传递依赖。
完整入口会带入 Preflight 和 Tailwind 默认主题变量。
`uniAppXTailwind` 会在编译后清洗 Vapor 不支持的选择器、声明和 at-rule；因此这里不切换到
utilities-only 入口，以保持默认主题、工具类和组件 `@apply` 的统一编译链。主题变量可以通过
`theme.css` 或项目自己的 `@theme` 配置提供。

在 `App.uvue` 中导入同一个入口：

```html
<style>
	@import './tailwind.css';
</style>
```

插件将匹配绝对 `entry` 的导入替换为编译后的工具类，保留其他导入与字体。
页面可以直接使用 `<text class="text-brand">Brand</text>`，组件样式可以使用
`@apply text-brand`。主题由入口配置提供。

包含 `#ifdef` / `#ifndef` 的公共 CSS 可以从 `tailwind.css` 间接导入。插件展开入口的本地 CSS
导入时，会按当前平台执行 uni 条件编译，再交给 Tailwind；因此 App 不会收到 Web 分支中的
`constant()` / `env()` 声明。插件仍只替换匹配 `entry` 的 App 导入，保留字体和其他样式。

脚本依赖提取同样先处理条件编译，包括 SFC 内联脚本、外链脚本和已扫描的共享脚本。
SFC 的 HTML 条件注释与脚本、样式内容分别识别，模板文案中的引号不会干扰脚本过滤。
平台、UTS 目标、自定义宏和版本比较使用当前构建环境；字符串中的指令示例不参与过滤。
未启用分支中的 import 不交给 resolver，当前分支真实缺失的依赖仍会报错。

## 全局与局部样式生成

0.3.0 默认按文件生成局部 utility：页面、组件及其已扫描脚本依赖中的完整候选归对应 SFC。
全局仅保留 App 作用域和公共 CSS 正向 `@source inline(...)` 明确声明的 utility。
函数返回值、循环成员和事件赋值不再因为 class 使用路径未被识别而兜底全局。

文件型 `@source` 只决定扫描范围，不表示全局归属。例如 `main.ts` 中的应用默认样式配置，
需要在公共 CSS 显式声明 `@source inline('mt-12 mx-12 mb-20');`。页面也使用这些类时，两处各保留一份。
共享主题变量、keyframes 等基础定义仍由公共编译结果提供，手写公共 CSS 不随 utility 裁剪。
局部 utility 直接复用入口已编译、清洗的 CSS 片段，保留生成顺序、条件规则和重要号，
不再为每个 SFC 生成中间 `@apply` 并重复调用 Tailwind。手写 `@apply` 仍按原编译链就地展开。
完整分类、样式隔离规则、迁移方式和验证记录见
[样式生成、隔离与迁移指南](./STYLE-GENERATION.md)。

同名绑定简写（如 `:class`、`:hover-class`）与显式绑定使用相同转换。
属性扫描完整跳过事件、指令等非 class 属性的值，不改写其中的业务字符串。
动态绑定中的实体表达式保留原文，由 Vue 解码求值后再转换绑定值，保持比较条件与函数参数的语义。
静态属性中的数值实体、基本命名实体及空白实体先解码，再转换安全类名；扫描因此缺少的候选会补编译，
继续遵守 `@source not` 排除规则及原有局部/全局归属。首次编译已生成的完整单类 utility 会从补编译候选中扣除，
全部已生成时跳过第二次编译；部分缺失时只补缺失项。手写同名 CSS、关系选择器和伪类规则不作为去重证据。
普通入口不增加 Tailwind 编译次数。
局部规则只注入当前平台生效的真实顶层 style，跳过注释、脚本字符串和未启用的分支。
自闭合或空的内联 style 可以承载局部规则；完整 SFC 转换、`@apply` 提取与 HMR 共用块识别，
索引按 Vue 实际保留的 style 块计数。运行时 class 转换函数同样只导入生效的真实脚本块。

## 根变量作用域

Tailwind 生成的 `:root` 规则会按平台转换。Web 使用标准根选择器：

```css
:root {
	--font-weight-bold: 700;
}
```

App 和小程序使用 uni-app x 的 `page` 标签选择器：

```css
page {
	--color-blue-600: rgb(21, 93, 252);
}
```

无需配置根节点参数，插件会自动处理 Tailwind 默认主题变量。

## 配置项

```js
uniAppXTailwind({
	entry: '/absolute/path/to/tailwind.css',
	componentLocalStyles: true,
	strict: true,
	allowEscapedSelectors: false,
	customAttributes: {
		'*': [/Class$/],
		'app-dialog': ['content-class']
	},
	colorVariables: ['--brand', /^--accent-/],
	utsRenameRetry: false,
	tailwind: {}
})
```

- `strict`：是否过滤非 class-only selector，默认 `true`。设为 `false` 会放宽 selector 过滤，
  但不会恢复被移除的 `content` 或不支持的 at-rule；5.31 Vapor 支持的动画规则保留。
- `allowEscapedSelectors`：是否允许带 CSS 转义符的 class selector。默认值为 Web 平台为 `true`，
  其他平台为 `false`。
- `entry`：项目唯一的 Tailwind 入口绝对路径。入口文件负责 `@source` 扫描和 Tailwind 主题配置，
  App 全局样式与组件 `@apply` 都复用该入口。
- `componentLocalStyles`：默认 `true`。按 `.uvue` 文件及脚本依赖收集完整候选，生成到对应局部样式模块。
  普通类名不变，特殊字符在绑定处转换为可读安全名，脚本原始数据不变。
  App 作用域和公共 CSS 的正向 inline 候选保留全局；未分配的独立脚本不自动全局化。
  页面和组件使用同一分配规则，不再依赖 `pages.json` 或完整 class 数据流证明。
  Web 复用可用 style，无可用块时新增 scoped style；App/小程序使用普通 style 交由框架隔离。
  已有外链 style 不阻止局部注入。局部规则保持 Tailwind 顺序与目标平台允许的媒体条件，
  仅 `@apply` 不额外生成独立 utility。设为 `false` 则关闭自动局部注入，保留全局 utility 模式。
  从 0.2.0 升级需迁移依赖隐式全局的样式配置，详见策略文档。
- `include`：Vapor CSS 清洗插件处理的额外文件匹配规则，默认匹配 `.css`、`.pcss` 和 `.postcss`。
- `exclude`：排除规则，默认排除 `node_modules` 和 `unpackage`。
- `utsRenameRetry`：是否为 HBuilderX 的 uts2js 滚动缓存重试并兜底 `rename`，所有平台默认 `false`。
  Windows 遇到对应缓存改名问题时可显式设为 `true`，该选项会修改进程内文件系统行为。
- `colorVariables`：`Array<string | RegExp>`，默认 `[]`。原生端显式选择需要生成 RGB 通道的自定义颜色变量，
  例如 `['--brand', /^--accent-/]`；字符串匹配完整变量名，正则匹配变量名。
  未选择的变量不做这种 RGB 通道转换，避免把宿主的普通自定义属性误判为颜色。
  所选变量的每个作用域必须使用不透明的 hex、rgb 或 oklch 色值；别名和半透明覆盖会报错，
  不会沿用其他作用域的通道。变量别名可在未选择的 `--color-*` 映射中引用所选颜色变量。
  `-rgb` 后缀保留给通道变量，不作为原始颜色变量再次转换。
- `themeValues`：可选的 `{ input: string | string[], output: string }`。按输入 CSS 的顺序导出变量数据，
  不配置时不生成文件。路径应为绝对路径，`output` 不能覆盖输入文件。
- `tailwind`：传递给 `@tailwindcss/postcss` 的插件选项。
- `customAttributes`：按标签名声明额外的 class 属性，默认 `{}`；`*` 表示所有标签。
  每个标签对应属性名字符串或正则表达式的数组；静态值和动态绑定都会转换。
  属性值可以是字符串、动态表达式或对象；对象会递归转换所有成员中的 class 字符串。

`entry` 应传入上述 `fileURLToPath(new URL(...))` 得到的绝对路径，而不是依赖当前工作目录。
`reference` 是 `entry` 未配置时的回退路径，`@apply` 与 App 样式应使用同一入口。
自定义属性只应配置真正承载 class 的字段；不要把包含普通文案的对象整体配置为 class 对象。

### 主题变量数据导出

需要在脚本或绘制 API 中读取主题变量的项目，可以启用独立的数据导出：

```js
uniAppXTailwind({
	entry: '/absolute/path/to/tailwind.css',
	themeValues: {
		input: ['/absolute/path/to/theme.css', '/absolute/path/to/skins.css'],
		output: '/absolute/path/to/generated/theme-values.ts'
	}
})
```

导出器只读取显式列出的 CSS 文件，不展开 `@import`，也不读取 Tailwind 清洗后的变量值。
后面的文件覆盖前面文件中相同模式、选择器和变量的值。顶层规则归为 `light`，
直接的 `@media (prefers-color-scheme: light/dark)` 归为对应模式，保留原始选择器名称：

```ts
export const themeValues: Map<string, string> = new Map<string, string>([
	['light:page:--brand', '#2563eb'],
	['dark:.palette-green:--brand', '#3dd5b1']
])
```

产物只包含变量表，不解释变量别名、节点局部覆盖或 CSS 级联。
它也不执行颜色转换；项目可直接使用 `themeValues.get('light:page:--brand')` 读取已导出的值，
按需在运行时代码中实现取值封装、主题切换与颜色转换。
包含变量的复杂媒体查询、`@supports`、嵌套规则等无法用该数据模型表达时，导出明确报错；
空变量值、缺失输入文件同样报错，不用不完整数据覆盖已有产物。

首次生成在 `configResolved` 完成，`buildStart` 再同步并注册输入监听，watch/HMR 在输入变化时刷新。
只在内容变化时写入输出，并自动创建其父目录；配置解析会生成文件，不能当作无副作用的读取。

例如显式配置 `colorVariables: ['--brand']` 后，原生端可以为 `--brand: #2563eb` 补充
`--brand-rgb: 37,99,235`，并把该变量的透明度颜色表达式转换为
`rgba(var(--brand-rgb),0.5)`；原变量保留，Web 不做这种通道注入。
宿主及普通 Tailwind 主题颜色变量保留运行时引用，不使用其他皮肤或媒体作用域的颜色覆盖。
未被显式选择、且各作用域均引用已选变量的颜色别名，会生成对应的通道别名，透明度表达式继续随皮肤变化。
自动通道保留原声明的顺序与 `!important`，同一作用域内的重复声明也逐条生成；输入中已有的通道保持原样。
可转换的 `@supports color-mix` 声明在原位置展开，不回写前后声明或改变其优先级。

安全类名继续使用可读短名。若不同原始工具类生成相同名称，编译会报错并列出两个原名及冲突名称；
例如 `bg-[url(a/b.png)]` 与 `bg-[url(a-b.png)]` 均映射为 `bg-url-a-b-png`，需要调整源类名。
碰撞检测在关闭 `componentLocalStyles` 时仍生效，不自动改变现有命名。

### Calc 静态折叠与单位

HBuilderX 5.31+ App Vapor 的 Android、iOS、HarmonyOS 已支持 `calc()`。插件在 App 侧折叠
Tailwind 生成的、可完全静态求值且保持属性语义的表达式，以减少运行时计算；这不是对“不支持 calc”的补丁。
优化范围仅为 Tailwind 工具类和 `@apply` 展开结果，不是通用 CSS 优化器。同一入口或 style 中的手写
CSS 声明及来源不明的声明不参与新增 calc 折叠，不能仅因文件经过 Tailwind 编译就把所有声明当作生成结果。

```text
1rem                 -> 1rem（不提供单位兼容补齐）
calc(1px * 12)       -> 12px
calc(1rpx * 12)      -> 12rpx
calc((12px + 8px) * 2) -> 40px
calc(100% - 20px)    -> 保留（不跨单位换算）
calc(var(--spacing, 0.25rem) * 4) -> 保留（运行时变量）
```

折叠遵循运算优先级、括号和 CSS 单位运算规则，只输出有限且语义等价的结果。不在 `px`、`rpx`、
`rem`、视口单位和 `%` 之间换算；任意值工具类中的常量计算也遵循相同边界。百分比能否折叠还取决于属性语义，
尤其不能无证据将圆角 calc 百分比改为裸百分比。长度单位支持需单独查[官方长度单位表](https://doc.dcloud.net.cn/uni-app-x/css/common/length.html)，
其中 App 的 `rem`、`vh`、`vw` 仍标为不支持；保留原单位不代表平台可用。

复用 Tailwind 最终 `@theme inline` 的解析结果：例如确定的 `--spacing: 4px` 被内联后，
`calc(4px * 4)` 可折叠为 `16px`；若 inline 值仍引用 `var(--space)`，则继续保留动态计算。
普通 `@theme` 或宿主 CSS 自定义属性可能被局部 class、媒体查询、内联样式或运行时更新覆盖，不能仅凭
找到默认值、fallback 或同名变量的最后一次声明而固化。残留 `var()`、`env()`、未知函数、无法统一的单位、
除零、非法语法或非有限结果时，整个 calc 保留，不局部改写内部子式。

自定义属性自身的 `calc()` 保持原值，因为最终用途可能带有负值钳制、整数取整或百分比约束；
只有已经内联到具体属性的计算继续参与折叠。

Web 保留原始计算；在 SCSS 前处理阶段，仅将 Sass 无法解析的 `calc(infinity * 1px)` 包装为字符串插值，Sass 输出后仍为原 CSS 表达式。
App 具体属性上的 `calc(infinity * 1px/rpx)`（分别指 px 或 rpx 形式）和 `3.40282e38px/rpx` 继续走专用分支，转换为对应单位的 `9999`；这是特殊值兼容约定，不是数学等价的静态折叠，自定义属性不参与该转换。
class selector 仍会转换为 Vapor 可用的安全名称。

### App Calc 限制

依据[官方 calc 注意事项](https://doc.dcloud.net.cn/uni-app-x/css/common/function.html#calc)：

- calc 中只支持 `var()` 方法，不支持 frequency（频率）、angle（角度）、time（时间）、color-function（颜色函数）、resolution（分辨率）、flex 类型。
- 支持属性范围为 `width`、`height`、`padding-*`、`margin-*`、`border-*`、`top`、`left`、`right`、`bottom`、`flex-basis`；不要据此扩展到所有 CSS 属性。
- 圆角不支持双值配置，例如 `border-bottom-right-radius: 10px 20px`；圆角 calc 包含百分比时，计算基准固定为 width。
- 边框宽度属性本身及其 calc 均不支持百分比。

插件保留无法安全解析的表达式，不代表目标平台一定支持它。例如保留含 `env()` 的 calc 不代表 App calc
可以执行该方法。平台属性限制与静态表达式求值是不同层面的约束，输出仍需按目标端编译与运行验证。

### 颜色透明度

Tailwind 的透明度颜色工具类由插件转换为原生端兼容的 `rgba`，无需改写使用方式：

```text
text-white/70       -> rgba(255, 255, 255, 0.7)
text-blue-600/75    -> rgba(21, 93, 252, 0.75)
```

其中透明度来自 class 名中的 `/70` 或 `/75`，不会写入基础颜色变量。基础变量仍保持不透明颜色：

```css
page {
	--color-blue-600: rgb(21, 93, 252);
}
```

### 非法值清洗

Tailwind 会根据扫描到的文本生成候选 CSS。说明文本或占位示例中的 `#...` 可能被误识别为颜色任意值，
从而生成 uni-app x 不接受的声明：

```css
.bg {
	background-color: #...;
}
```

插件的 Vapor 清洗阶段会删除这类明显非法的占位值，避免它们进入 App CSS。清洗不是任意值白名单：
合法的 `bg-[#fff]`、`text-[14px]`、`w-[200rpx]` 和主题变量仍会正常生成。实际使用动态 arbitrary class
时，必须让完整候选类出现在扫描范围内，或在入口 CSS 通过 `@source inline(...)` 显式收录。

## Class 短名规则

普通 class（仅含 `[a-zA-Z0-9_-]`）保持原样，包括 `flex-row`、`p-4`、`-mt-4`、
`app-tag__text`，已有业务前缀也保持不变。含特殊字符的 class 恢复可读短名：末尾 `!`
转换为 `-important`，符号序列简化为 `-`，合并重复分隔符并移除尾部分隔符，保留首部负号。
任意值开头的数字负号使用 `neg-`，小数点使用 `dot`，只转换含特殊字符的输入。
模板 class、CSS selector 和已配置自定义样式属性的绑定结果使用相同规则，不全量编码、不使用哈希，也不添加保留命名空间。

```text
p-0!            -> p-0-important
dark:text-white -> dark-text-white
text-[#fff]     -> text-fff
-mt-[1px]       -> -mt-1px
mt-[1px]        -> mt-1px
mt-[-1px]       -> mt-neg-1px
w-[1.5px]       -> w-1dot5px
w-[1-5px]       -> w-1-5px
p-1.5          -> p-1dot5
p-1-5          -> p-1-5
```

已确认的回归 `-mt-[1px]` 与 `mt-[1px]`、`mt-[-1px]` 与 `mt-[1px]`、
`w-[1.5px]` 与 `w-[1-5px]` 均保持不同名称；`p-1.5` 与 `p-1-5` 也分别处理。
这是可读短名方案，存在与自定义 class 冲突的理论可能，不保证绝对无碰撞。例如自定义
`p-0-important` 会与 `p-0!` 相同，`dark-text-white` 会与 `dark:text-white` 相同。
源码继续使用原始 Tailwind class，更新后重新编译模板与 CSS。

归一化对重复输入幂等，无须缓存模块完整输出，已有短名可直接再次处理。CSS selector
在归一化前解码 CSS 转义，保留十六进制转义及其终止空白的支持；模板属性值不执行 CSS 解码。
归一化只作用于模板的 `class`、`hover-class`、已配置的 `customAttributes` 和 `v-bind` 样式字段。
属性表达式中可直接确定的字面量在构建时转换；变量、函数返回值、动态对象键和带 JS 转义的字符串，
由插件在绑定处注入共享转换函数，先求值再转换。普通 `.uvue` / `.ts` / `.uts` 脚本的变量、
候选数组、比较条件、全局配置和列表项始终保留原值，不反向改写字符串定义。
自定义属性的样式对象仅复制发生变化的路径；`v-bind` 仅转换匹配的样式字段，
业务字段与事件保留原值，均不修改传入对象。
`v-bind="$attrs"` 保留原写法：透传的 class 已在父级使用处转换，避免破坏小程序编译器的原生节点透传识别。

例如 `buttonStyle` 同时用于 class 和文字展示时，脚本中的 `bg-[#000]` 保持不变，
文字仍显示 `bg-[#000]`，只有节点实际使用的 class 转换为 `bg-000`。共享转换函数由插件自动导入，
业务源码无需手动引入；CSS 扫描和局部归属分析仍读取原始完整候选类名。

### 重要号 Class

Vapor 原生 CSS 对转义的 `!` selector 兼容性有限。插件会把以下 class：

```html
<view class="p-0! bg-red-500!" />
```

转换为安全名称：

```html
<view class="p-0-important bg-red-500-important" />
```

CSS 中对应的 Tailwind 重要号规则也会被转换为相同的安全 selector，同时保留声明的
`!important` 语义。

自定义 class 属性须通过 `customAttributes` 显式声明，默认仅处理 `class` 和 `hover-class`。
运行时转换不会生成新的 CSS；应使用扫描范围内的完整候选 class，或通过 `@source inline(...)`
显式收录。`@source inline(...)` 只影响 CSS 生成，不修改脚本数据。共享转换函数复用构建阶段的
类名映射规则，确保节点 class 与 CSS selector 一致。

## `@apply` 工作方式

`@apply` 由 `@tailwindcss/postcss` 在 Vite CSS 处理链中编译：

```scss
.button {
	@apply flex-row items-center;
}
```

处理过程如下：

1. `uniappx-tailwind-reference` 向包含 `@apply` 的 Vue style module 注入配置的 `@reference`。
2. `@tailwindcss/postcss` 接收 Tailwind 入口和 Vue 虚拟 style module。
3. Tailwind 根据扫描到的 class 和 `@apply` 生成标准 CSS。
4. 兼容桥接从 SCSS 语法树读取真实 `@apply`，批量编译普通指令；任意值按表达式单独处理，随后按源码位置替换。
5. `uniappx-tailwind-vapor-compat` 在后置阶段解析生成的 CSS AST。
6. 适配器清洗 selector、声明和 at-rule，并返回给 uni-app x 编译器。

注释和字符串中的 `@apply` 不参与编译或独占候选裁剪；规则末尾省略分号的合法指令同样支持。
替换只修改真实指令片段，其他 SCSS 内容保持原文。

热更新时，未变化的 style module 会复用 `@apply` 编译结果和关键帧记录。缓存按模块 ID
隔离，并在使用前核对 Tailwind 报告的主题、配置及嵌套导入依赖；新增导入会更新监听范围。
编译期间发生源码或依赖变更时不写入缓存，后续重新编译。入口和 `@apply` 的 CSS 清洗
直接接收 AST 的副本，保留声明来源并减少字符串序列化及重新解析。
watcher 的失效版本同时传入 Tailwind 的编译输入，文件时间戳和大小未变时也能刷新其内部主题缓存。

入口编译按源码版本发布局部样式、依赖归属和文件签名。连续保存时，过期请求等待最新入口结果；
旧请求失败不会清除新请求的缓存；入口和首次展开的嵌套 CSS 在读取前即参与失效判断，避免保存期间缓存旧内容。
文件记录跨入口重编译复用，缓存原始候选、安全类名、脚本 import 和解析路径。单文件修改只重读
变化文件，style-only 热更新也复用其 SFC 内容；文件增删或扫描集合变化后重新解析依赖路径。
主题变化重新筛选原始候选，缓存随实际扫描集合替换，已删除或被排除的文件不会一直驻留。
文件签名和目录检查继续保留，用于发现未收到 watcher 通知的变更；编译完成后同步清除待处理标记。
并发入口请求合并正在执行的签名检查，同一请求的源码比较复用已取得的版本快照；后续独立请求仍重新检查。

包含 Sass 插值或变量的动态表达式仍由对应的 Sass 处理，例如：

```scss
.button {
	@apply text-#{map-get($colors, primary)};
}
```

原因是这类表达式必须先经过 Sass 求值，不能在 Tailwind 扫描阶段可靠解析。

## 工作原理

`uniAppXTailwind()` 返回一组 Vite 插件。适配器内部调用 `@tailwindcss/postcss` 完成 Tailwind
编译，再负责编译前后的 Vapor 兼容处理。

### 1. `uniappx-tailwind-important-class`

在 `pre` 阶段处理 `.uvue` 的非 style 内容，按文件及脚本依赖归属将局部 utility 映射到插件已有的安全类名，
并在对应样式模块中追加入口已编译的 CSS；随后查找重要号 class 并映射为安全 class 名称。
Web SCSS 中的自动生成片段会在 Sass 处理前保护 `calc(infinity * 1px)`，保留圆角语义；
已编译的 CSS 虚拟模块直接注入 CSS，不混入 Sass 插值。
样式模块中的重要号 selector 由后面的 CSS 清洗阶段处理。

### 2. `uniappx-tailwind-app-style`

在 `pre` 阶段专门处理 `App.uvue` 样式：

1. 检查是否导入 Tailwind 入口。
2. 编译完整入口并清洗 CSS，仅从有 Tailwind 来源证据的 utility 中裁剪非全局候选；保留公共 CSS 和局部样式需要的主题、动画基础定义。
3. 只替换入口导入，保留同一 style 块内的其他内容；只有收到实际缓存的输出时才复用原始源码。
   删除入口导入后返回 `null`，重新加入入口导入后可继续编译。

### 3. `uniappx-tailwind-reference`

在 `pre` 阶段向包含 `@apply` 的 Vue 样式模块注入 Tailwind `@reference`。它只建立主题和
utility 上下文，实际 `@apply` 编译仍由 `@tailwindcss/postcss` 完成。

### 4. `uniappx-tailwind-apply-fallback`

部分 uni-app x SCSS 虚拟模块使用 `?vue&type=style&...&lang.scss` 标识，当前桥接会在检测到 `@apply` 后，
使用同一份 Tailwind 入口编译残留指令，再交给 Vapor 清洗阶段。

### 5. `uniappx-tailwind-vapor-compat`

在 `post` 阶段处理 CSS 输出：

- 解析 CSS AST，而不是简单替换字符串。
- 过滤不符合 Vapor 规则的 selector。
- 清理不支持的 at-rule 和 declaration。
- 删除明显非法的 CSS 占位值，避免无效颜色等内容进入 App CSS。
- 展开 `@layer`。
- 作用域化 `:root`。
- 转换颜色和部分 Tailwind 特殊计算值；新增 calc 折叠在 Tailwind 生成结果的来源边界内执行，不对后置阶段遇到的普通 CSS 无条件求值。

## 热更新

Tailwind 的全局产物位于 `App.uvue` 的样式模块，默认还会在各 `.uvue` 样式模块生成局部工具类。
App 样式模块本身不 import 被扫描的源文件，构建工具默认不知道这些扫描依赖。
插件因此显式登记依赖，并在相关源码变化时更新全局与受影响的局部样式模块：

- 编译入口后，把 Tailwind 报告的 `dependency` 文件和入口本身通过 `addWatchFile` 登记。
  Vite dev server 会把它们记入模块图，`vite build --watch` 会把它们记为 transform 依赖，
  两种模式下源文件变化都会重新编译 Tailwind。
- `.uvue`、`.ts`、`.uts` 或入口文件变化时，`handleHotUpdate` 先失效已发现的 `App.uvue` 样式模块，
  再把它加入本次热更新的模块列表，浏览器会重新请求并拿到新的 CSS。
- 开启局部生成时，`.uvue` 更新刷新自身 style，共享脚本更新刷新全部局部消费者；公共 CSS 变化刷新已加载的局部样式。路由登记不再改变 utility 归属。

验证热更新时要走 Vite 的文件变更钩子，再请求 `App.uvue` 样式模块；测试中不能只连续调用
`plugin.transform()`。页面或 UTS 源文件变化应触发 `handleHotUpdate`，入口及其主题、皮肤 CSS
依赖变化应触发 `watchChange`，然后检查重新编译结果是否包含最新的 class、变量值和 CSS 声明。
Node 单元测试覆盖了这三类变化：

```bash
pnpm test
```

`utsRenameRetry` 与 Tailwind 无关，只是修复热更新链路上的一个 Windows 问题：HBuilderX 的 `uts`
插件在 `buildEnd` 里对 code、semantic、syntactic、types 四个滚动缓存依次执行
`removeSync(<cache>/cache)` 再 `renameSync(<cache>/cache_, <cache>/cache)`。`removeSync` 只是
`fs.rmSync(recursive, force)`，没有任何重试；Windows 上被删除的目录名在所有句柄关闭前仍处于
delete-pending 状态，文件监听器、杀毒软件扫描或并行运行的第二个构建都会延长这个窗口，紧随其后的
rename 因此抛出 `EPERM: operation not permitted`，整次构建以 `[plugin:uts] EPERM` 结束。

补丁只作用于匹配 `.uts2js` 的目标路径，分两级处理：

- 先按指数退避重试（默认 4ms 起、64ms 上限、单个 8s 窗口内共享 2s 预算）。句柄通常在几十毫秒内
  释放，缓存得以保留，这是性能最好的结果；预算按窗口共享，因此一次 `buildEnd` 的四次 rename 最多
  只阻塞 2s。
- 预算耗尽后，如果这次 rename 正是 `cache_` -> `cache` 的滚动动作，则放弃改名并让 `buildEnd` 正常
  结束，错误不再冒泡到控制台。下一次构建的 `emptyDirSync(cache_)` 会清掉半滚动状态并把所有条目视为
  脏数据，代价是这一份缓存的一次全量重编译，不会读到过期缓存。放弃时会通过 `debug` 日志给出提示。

非 `.uts2js` 路径、非可重试错误码和非滚动动作的 rename 行为完全不变；默认不安装此补丁。
补丁在插件构造时安装，早于任何构建钩子，不依赖 `buildStart` 的执行顺序。

## 平台差异

- `@media (prefers-color-scheme: light/dark)` 在 Web、小程序和 HBuilderX 5.25+ App Vapor 中保留；
  `sm:`、`md:`、`lg:` 等响应式媒体查询在原生端仍会移除。
- App Vapor 5.31+ 的 Android、iOS、HarmonyOS 支持 `@keyframes` 和 `animation`；[官方 animation 表](https://doc.dcloud.net.cn/uni-app-x/css/animation.html)标明 Android/iOS 拍平节点从 5.31 支持，HarmonyOS 拍平节点不支持，具体属性值仍有差异。
- App 将 Tailwind 来源关键帧中的 `transform: none` 转为等价的 `translateY(0)`：5.31 字节码会将前者编为 `null`，使 bounce 的中间帧无法参与原生变换插值。模板工具类与 `@apply` 使用相同规则，手写关键帧（包括同名关键帧）不参与；Web 和小程序保留原值。
- App 对 Tailwind 生成的 `animation: var(--animate-*)` 内联最终静态 `@theme` 动画值，再由 HBuilderX 展开长属性，避免依赖基座对变量简写的运行时拆解。手写声明不参与；Web 和小程序保留变量引用及运行时覆盖语义。
- App 的静态主题动画内联后不能再通过覆盖对应 `--animate-*` 变量调整动画。包含 `var()` 的自定义主题动画、`animate-(--runtime-animation)` 和非主题 fallback 原样保留，不递归冻结运行时值；这些动态简写在基座上的运行支持需要单独验证。
- App Vapor 5.31+ 的 `<text>` 支持 `word-break: normal / break-all`，三端拍平节点也支持；不依据语法列表推断 `keep-all`、`break-word` 可用，见[官方 word-break 表](https://doc.dcloud.net.cn/uni-app-x/css/word-break.html)。
- `tailwind.optimize` 在所有平台固定为 `false`，即使调用方传入 `true` 也不启用等价样式改写。
- 默认情况下，原生端不保留带 CSS 转义符的 class selector；Web 默认允许保留。
- CSS 动画按官方属性支持范围使用；需要脚本控制或兼容受限节点时，使用 uni-app x 动画 API 或组件内部的平台实现。

## 限制

- 它不是通用的 Tailwind CSS polyfill，不能让所有 Web CSS 在 uni-app x 原生端可用。
- calc 优化仅针对 Tailwind 生成的 CSS，不是宿主普通 CSS 的通用优化；未折叠表达式和原单位透传不构成平台兼容保证。
- `strict: false` 只是关闭 selector 过滤，不代表 Vapor 支持这些 selector。
- `@apply` 的动态 Sass 表达式必须由 Sass 先求值，不能依赖 Tailwind 扫描阶段解析。
- 动态运行时 class 必须在 Tailwind 扫描范围内，或者通过 Tailwind 的 `@source inline(...)`
  显式加入，否则不会生成对应 CSS。
- 文件级收集可能包含与 utility 同名的业务文本；这是保守扫描，不保证按运行时使用精确裁剪。
  共享脚本须位于 Tailwind 扫描范围，模块依赖不做按导出成员的 tree shaking。
- 局部 style 遵守 uni-app x 的隔离契约。父组件传入的类名虽在父组件局部生成，
  也不能自动作用于子组件内部；需明确公共 CSS 或有效的 `externalClasses` 通道。
  `customAttributes` 只控制绑定处转换，不授权样式穿透。
- 类名匹配后仍遵循 CSS 级联；覆盖组件已有样式或内联值时，按实际冲突使用重要号或组件对应的属性。
- 重要号 arbitrary value class 会映射为安全名称；模板静态 class 和运行时 class 必须保持一致，
  不能手动只修改其中一侧。

## 开发与验证

在本仓库中运行插件测试：

```bash
pnpm test
```

测试覆盖 Tailwind PostCSS 编译、重要号 class、selector 清洗、单位转换、动画保留策略、颜色转换、
App 样式入口处理和 uts2js 滚动缓存的 rename 重试与兜底。

工程侧发布检查执行 `node scripts/prepare-release-host.mjs`：实际 `npm pack` 后，在独立临时宿主
只声明插件 tarball，由 pnpm 安装内部依赖，检查公开 JS / CSS 入口、六个目标平台的样式与 `@apply`。
添加 `--npm` 可验证 npm 安装。
示例只使用宿主相对路径，不链接本仓库的依赖。
普通 Node 单测和发布冒烟检查不代替完整项目编译、设备运行或框架 E2E。
配置 HBuilder V 配套 SDK 后，Node 回归还会执行真实 Vite watcher 和原生动画 CSS 编译检查；缺少 SDK 时相关测试会明确跳过。

Node 构建工具需要复用主题解析时，可从 `tao-tailwindx` 导入 `parseThemeValues(css)`；返回的 Map 键为 `模式:选择器:变量名`。
