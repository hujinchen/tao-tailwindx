# Tao Tailwind X 配置与使用说明

本文列出当前配置和处理边界。安装、Vite 注册与 CSS 入口见 [README.md](./README.md)，局部生成和组件隔离见 [STYLE-GENERATION.md](./STYLE-GENERATION.md)。

## 基本配置

在 Vite 配置中使用入口的绝对路径，`uniAppXTailwind()` 必须放在 `uni()` 前面，使 Tailwind 指令先于 uni/Sass 处理：

```js
import { fileURLToPath } from 'node:url'
import { uniAppXTailwind } from 'tao-tailwindx'

const entry = fileURLToPath(new URL('./tailwind.css', import.meta.url))

uniAppXTailwind({
	entry,
	customAttributes: {
		'app-dialog': ['content-class']
	},
	colorVariables: ['--brand']
})
```

CLI 项目按实际目录调整入口，例如 `./src/tailwind.css`。插件返回的数组可直接放入 Vite 的 `plugins`，无需展开。Node 构建入口只在构建配置中导入。

Tailwind 入口使用 `tao-tailwindx/tailwind.css`，由 `App.uvue` 导入同一个入口；插件只替换匹配 `entry` 的导入，保留其他导入和手写样式。公共 CSS、脚本及 SFC 按当前平台执行条件编译，未启用分支不参与依赖收集。

## 配置项

| 参数                        | 默认值                               | 用途                                                                |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `entry`                     | 未配置                               | Tailwind CSS 入口绝对路径，App 样式和组件 `@apply` 共用             |
| `reference`                 | 未配置                               | 未提供 `entry` 时使用的入口路径                                     |
| `componentLocalStyles`      | `true`                               | 按 SFC 及其已扫描脚本依赖生成局部工具类；`false` 使用全局工具类模式 |
| `customAttributes`          | `{}`                                 | 按标签名声明额外承载 class 的属性                                   |
| `strict`                    | `true`                               | 过滤不符合 class 选择器规则的复杂选择器                             |
| `allowEscapedSelectors`     | Web 为 `true`，其他为 `false`        | 是否允许 CSS 转义类选择器                                           |
| `allowDarkVariantSelectors` | Web、小程序为 `true`，其他为 `false` | 是否保留 Tailwind 官方 `dark:` 变体选择器                           |
| `colorVariables`            | `[]`                                 | 显式选择非 Web 端需要生成 RGB 通道的自定义颜色变量                  |
| `themeValues`               | 未配置                               | 从指定 CSS 文件导出主题变量数据                                     |
| `include`                   | 匹配 `.css`、`.pcss`、`.postcss`     | CSS 清洗器处理的额外文件匹配规则                                    |
| `exclude`                   | 匹配 `node_modules`、`unpackage`     | CSS 清洗器排除的文件匹配规则                                        |
| `utsRenameRetry`            | `false`                              | 为 uts2js 缓存改名启用重试处理                                      |
| `tailwind`                  | `{}`                                 | 透传给 `@tailwindcss/postcss` 的选项；`optimize` 始终为 `false`     |
| `debug`                     | `false`                              | 输出构建、归属和热更新诊断信息                                      |

`include`、`exclude` 和 `colorVariables` 接收字符串或正则表达式的数组。颜色变量字符串按完整名称匹配，正则用于批量选择。

`strict: false` 只放宽选择器过滤，不恢复被删除的声明或 at-rule；允许选择器通过也不代表目标平台支持它。

## 自定义 class 属性

默认转换 `class` 和 `hover-class`。其他承载 class 的属性需显式声明：

```js
customAttributes: {
	'*': [/Class$/],
	'app-dialog': ['content-class', 'pt']
}
```

`*` 匹配所有标签；每个标签对应属性名字符串或正则表达式的数组。静态值、动态绑定和对象成员中的 class 字符串均会转换。

只配置真正承载 class 的字段；对象会递归处理字符串，不应包含需要保持原样的普通文案。插件在绑定处转换，不修改脚本变量、比较条件或传入对象；动态 `v-bind` 仅处理匹配的样式字段，`v-bind="$attrs"` 保留原写法。

该配置只控制类名转换，不授权样式穿透。跨组件定制仍需遵守组件隔离及 `externalClasses` 契约。

## Class 安全名称

仅含 `[a-zA-Z0-9_-]` 的普通 class 保持原样，特殊字符转换为可读名称：

```text
p-0!            → p-0-important
dark:text-white → dark-text-white
text-[#fff]     → text-fff
-mt-[1px]       → -mt-1px
mt-[-1px]       → mt-neg-1px
w-[1.5px]       → w-1dot5px
w-[50%]         → w-50-percent
```

末尾 `!` 转为 `-important`，百分号转为 `-percent`，小数点用 `dot`，任意值的数字负号用 `neg-`，其他符号简化为 `-`。CSS 选择器与绑定结果使用同一规则，保留声明的 `!important`。

源码始终使用原始 Tailwind 类名，转换函数由插件按需注入，无需业务代码手动导入。不要只修改模板或 CSS 的一侧。

可读名称可能发生碰撞，例如 `p-0!` 与自定义 `p-0-important`。同一次编译发现不同原名映射到同一名称时会报错，需要调整源类名；关闭局部生成不会关闭碰撞检查。

运行时转换不会生成新的 CSS。`'p-' + size` 等拼接应改为扫描范围内的完整类名映射，或通过公共 `@source inline(...)` 显式收录。

## 颜色变量与透明度

非 Web 端会转换 Tailwind 的 `color-mix()`、oklab 等颜色表达式。自定义颜色变量需要 RGB 通道时，通过 `colorVariables` 显式选择：

```js
colorVariables: ['--brand', /^--accent-/]
```

例如 `--brand: #2563eb` 会补充 `--brand-rgb: 37,99,235`，透明度表达式可转换为 `rgba(var(--brand-rgb),0.5)`，原变量保留。Web 不注入这些通道。

- 所选变量在每个作用域都必须使用可转换的不透明 hex、rgb 或 oklch 色值；别名或半透明覆盖会报错。
- 可在未选中的 `--color-*` 映射里引用所选颜色变量；符合条件的别名生成对应通道，保持皮肤切换语义。
- `-rgb` 后缀用于通道变量，不应作为原始颜色变量再次选择。已有通道保持原样。
- 根、组件、媒体和皮肤作用域按原声明处理，保留顺序与 `!important`，不使用其他作用域的颜色覆盖当前值。

## 主题变量数据导出

需要在脚本或绘制 API 中读取主题值时，配置 `themeValues`：

```js
themeValues: {
	input: ['/absolute/path/theme.css', '/absolute/path/skins.css'],
	output: '/absolute/path/generated/theme-values.ts'
}
```

`input` 接收单个路径或路径数组，输入和输出均使用绝对路径，输出不能覆盖输入文件。生成的 TypeScript 模块导出 `Map<string, string>`，键为 `模式:选择器:变量名`：

```ts
export const themeValues: Map<string, string> = new Map<string, string>([
	['light:page:--brand', '#2563eb'],
	['dark:.palette-green:--brand', '#3dd5b1']
])
```

使用 `themeValues.get('light:page:--brand')` 读取值。导出规则：

- 只读取列出的原始 CSS，不展开 `@import`，不读取清洗后的值，也不解析别名、颜色或 CSS 级联。
- 顶层变量归 `light`；直接的 `@media (prefers-color-scheme: light/dark)` 归对应模式，保留原选择器。
- 后面的输入文件覆盖前面文件中相同模式、选择器和变量的值。
- 包含变量的复杂媒体查询、`@supports`、嵌套规则、空变量值或缺失文件会报错，不覆盖已有产物。
- 配置解析时首次生成，输入变更时刷新；只在内容变化时写入，并创建输出父目录。

Node 构建工具也可从 `tao-tailwindx` 导入 `parseThemeValues(css)`，使用同一解析规则取得变量表。

## `@apply`

页面或组件样式可直接使用入口中定义的工具类和主题：

```scss
.button {
	@apply flex-row items-center text-brand;
}
```

插件自动建立入口引用并展开真实指令，保留声明顺序、重要号和动画依赖。注释与字符串中的 `@apply` 不参与处理，其他 SCSS 内容保持原文。

包含 Sass 变量或插值的动态表达式必须先由 Sass 求值，不能依赖 Tailwind 扫描推导；插件顺序仍须保持在 uni 插件之前。

## 平台处理与限制

| 项目           | Web                | App / 小程序                                                                                      |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| 根变量选择器   | `:root`            | `page`                                                                                            |
| 媒体查询       | 保留               | 小程序保留；App 仅保留明暗配色查询                                                                |
| 原生声明与变量 | 保留浏览器原生形式 | 清理 `content`、`resize`、`@property` 和 `display: block/grid/table` 等输出，适配颜色与部分计算值 |
| 动画           | 保留               | 保留关键帧与动画声明，按目标 SDK 和节点支持范围验收                                               |

`@layer` 会展开，明显非法的 `#...` 占位值会删除；合法任意值继续处理。Tailwind 优化全端关闭，避免改写已适配的声明形式。

App 的 Tailwind 静态主题动画会内联 `--animate-*` 值，不能再通过覆盖该变量调整动画。含 `var()` / `env()` 的动态主题动画保持引用，运行支持需单独验收；手写动画不参与该内联。

### 计算值与单位

非 Web 端仅折叠 Tailwind 工具类和 `@apply` 生成的、可静态求值且保持属性语义的计算，手写或来源不明的 CSS 不参与该静态折叠：

```text
calc(1px * 12)                 → 12px
calc((12px + 8px) * 2)         → 40px
calc(100% - 20px)              → 保留
calc(var(--spacing) * 4)       → 保留
1rem                          → 保留原单位
```

不跨单位换算；残留变量、未知函数、除零或非有限结果时保留整个表达式。自定义属性中的计算保留原值，只有内联到具体属性且符合条件时才参与折叠。

`calc(infinity * 1px/rpx)` 和对应单位的 `3.40282e38` 特殊值在具体属性上转为 `9999px/rpx`；这是特殊兼容处理，自定义属性不参与。Web 保留原计算，仅在 SCSS 编译前保护 Sass 无法解析的 infinity 写法。

保留单位或表达式不代表目标端可用。插件不补齐 `rem` 等单位支持，也不能让全部 Web CSS 在 App 可用；属性、节点和组件隔离限制需按目标 SDK 编译与运行验收。

### Windows 缓存改名

遇到 `[plugin:uts] EPERM` 等 uts2js 滚动缓存改名错误时，可显式设置 `utsRenameRetry: true`。

该选项修改当前进程的 `fs.renameSync`，只针对匹配 `.uts2js` 的目标路径和可重试错误。使用共享重试预算；耗尽后放弃本次 `cache_` 到 `cache` 的滚动改名，后续构建可能重建该缓存。开启 `debug` 可查看放弃提示，默认不安装补丁。

维护者的检查命令和 SDK 配置见源码仓库中的 `PUBLISHING.md`，发布版本的实测记录见 [CHANGELOG.md](./CHANGELOG.md)。
