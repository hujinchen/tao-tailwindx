# Tao Tailwind X CSS 用法示例

示例按 [uni-app x 官方 CSS 目录](https://doc.dcloud.net.cn/uni-app-x/css/align-content.html)与 [Tailwind CSS 官方文档](https://tailwindcss.com/docs/styling-with-utility-classes)对照整理，包含 110 项属性入口、913 个 Tailwind 写法（Web），分为弹性布局、布局与层级、尺寸与间距、背景与效果、边框与圆角、文字排版、变换与动效、Web 扩展八类。

## 运行

此工程通过随工程附带的 npm tarball 安装插件。解压后执行 `pnpm install`，再用 HBuilder V（HV）或 HBuilderX（HX）打开工程运行。正式发布后也可以执行 `pnpm add -D tao-tailwindx`。

使用目标 IDE 配套的 uni-app x 编译器 5.31+，App 启用 Vapor。

源码仓库中先执行 `pnpm run test:package`，生成可运行的 `demo-output/tailwind-uniappx-demo/`。不要直接运行缺少 `package.json` 的模板目录。

## 查看与维护

- 首页支持按 CSS 属性名、中文用途、分类或完整 Tailwind 写法搜索，例如 `text-red-500`、`shadow-lg`。
- 每个属性都有独立的页面地址，例如 `/pages/css/property?name=align-content`。共用一个预览页面，避免复制 110 份布局和交互代码。
- 各端点击“查看 DCloud 官方说明 ↗”后，统一通过 `/pages/webview?name=align-content` 打开对应的官方文档；独立页面保留默认导航栏用于返回。小程序加载仍受平台域名、账号类型与调试设置限制，微信端参见 [web-view 官方说明](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)。
- 属性页支持按 class、值和说明搜索，默认展示 12 张卡片，可继续分批展示。每张卡片显示完整 Tailwind class、CSS 对照值和可观察的效果；组合工具类会列出多个声明。颜色展示 Tailwind 主题原值，App 生成时会转换为 sRGB。
- 离散关键字和圆角等级逐项演示；颜色、命名容器尺寸和字号各选两个代表值说明语法。长度、时间、数字、任意值等无限值类型使用代表值，简写使用常见组合。
- `pages/css/catalog.ts` 保存完整 class 字符串；插件可扫描这些静态候选，运行时在绑定处转换类名。不要拼接 `border-${value}` 等无法扫描的 class。
- `pages/css/property.uvue` 提供多行 Flex、尺寸参照、事件穿透、文字截断、可重新播放的动画和独立滚动时间轴等实际场景。
- 动画变量示例使用 `theme.css` 的 `@theme` 定义 `--animate-demo` 和自定义 `@keyframes demo-slide`，通过 `animate-(--animate-demo)` 在 2s 内向右移动 120px，再反向返回，循环往返。`theme.css` 由示例的 `tailwind.css` 导入，`@theme` 写在这个被导入的文件中同样有效；主题关键帧生成到全局，避免页面作用域改名。App 复用插件的静态主题展开，不能在运行时覆盖该变量；Web 和小程序保留变量引用。HX 5.34 会把普通 `animation: var(--demo-animation)` 的整段变量引用原样复制到各动画长属性，导致无法正常播放，因此固定动画使用主题配置。
- 边框预览只补齐当前方向缺少的宽度、样式或颜色；单边示例不叠加其他方向的边框。预览对象使用主题底色和字色，避免蓝色边框与蓝色背景混在一起。
- 文字颜色同时在浅底和深底展示，便于比较可读性；阴影预览使用不透明白底。
- 组件属性遵循 uni-app x 文档；输入框不使用 `aria-label`，代码文本使用 `user-select` 支持选择和复制。
- 布局样式复用 `@apply`，主题通过 CSS 变量同时提供浅色和深色模式；不下载额外字体或图片。
- `theme.css` 的浅色与深色变量统一定义在 `page`，平台转换和隔离由 uni-app x 处理。页面保持默认的 `app` 隔离策略；改成 `isolated` 时，需在页面或组件内定义所需变量，不能依赖 App 的 `page` 变量。
- 此模板将 Tailwind `--spacing` 设置为 `1px`，所以 `p-16`、`w-112`、`top-40`、`leading-32` 分别对应 16px、112px、40px、32px。`*-px` 始终为 1px，数字工具类也支持小数。
- App 不直接支持默认主题中的 `rem`。模板通过 `@theme inline` 将命名字号、圆角显式定义为 px，按 Web 默认的 1rem = 16px 折算；通用字体族也用单个字体名定义。它们是此模板的主题配置，插件不会自动把业务项目中的 rem 改成 px。
- 命名容器尺寸仅演示 `3xs`、`2xs`：模板将它们自定义为 160px、200px，便于在手机预览中观察宽度与 min/max 约束；这两个值不是 Tailwind 的默认容器尺寸。尺寸预览框随可用宽度收缩，最大为 240px。

## Tailwind 用法覆盖

对照项目固定的 Tailwind CSS 4.3.5。命名颜色示例值来自该版本的 `tailwindcss/theme.css`，仅选取 red-500、blue-500 演示；其他颜色和 50–950 色阶可使用相同语法。目录中的类名保存为静态字符串，运行时不拼接候选。

| 用法           | 示例与覆盖范围                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| 命名颜色       | `text-red-500`、`bg-blue-500`、`border-red-500` 等；每项用 red-500、blue-500 两个代表色说明颜色名与色阶的写法 |
| 颜色修饰符     | `text-red-500/50`、`bg-red-500/[35%]`、`border-[#2563eb]/50`、颜色类型提示与单边颜色；v4 后缀 `!`             |
| 阴影           | `shadow-2xs` 到 `shadow-2xl`、`shadow-none`、任意值和变量；颜色、透明度、inset、ring 组合按下方边界限制       |
| 尺寸           | 数字、小数、`*-px`、分数、full、auto、`size-*`；`3xs`、`2xs` 两个命名容器尺寸，变量、rpx 与 calc              |
| 间距           | 单边、`mx/my`、`px/py`、负值、auto、变量和任意值；App 将双轴间距改写为物理方向属性                            |
| 边框与圆角     | 默认 `border`、数字宽度、长度类型提示；xs–4xl 圆角、单角、单侧双角、full 与变量                               |
| 排版           | `text-sm`、`text-lg` 两个命名字号，字重、命名字体、自定义 `font-icon`；字号 / 行高组合、行高变量与 `truncate` |
| 弹性布局       | 对齐、换行、伸缩系数、`flex-2`、分数基础尺寸和变量                                                            |
| 效果与动效     | 命名背景模糊、整体透明度、变换组合与变量、过渡与动画变量；保留现有四种内置动画与事件控制                      |
| Web 变体与组合 | `md:`、`dark:`、`[&]:`；线性渐变方向、from/via/to 色标及位置、角度与颜色空间                                  |
| 主题与复用     | `@theme inline`、`@apply`、CSS 自定义变量、`:class` 数组与运行时状态绑定                                      |

## 支持边界

首页显示当前编译目标的示例数量。平台条件既控制可见示例，也控制参与生成的 CSS 候选。App 动画需要 Vapor 5.31+，背景模糊需要 Vapor 5.25+；示例没有给这些对象设置 `flatten`。

官方 CSS 目录包含仅 Web 支持的属性和受限枚举，不能将全部目录视为所有端都支持。滚动驱动动画还取决于浏览器对对应 CSS 的支持。

| 当前编译目标                              | 示例数 |
| ----------------------------------------- | -----: |
| Web                                       |    913 |
| Android / iOS / 微信小程序 / 支付宝小程序 |    741 |
| HarmonyOS                                 |    735 |

[盒子阴影官方说明](https://doc.dcloud.net.cn/uni-app-x/css/box-shadow.html)指出 HarmonyOS 不支持 inset 与扩散半径，因此 `shadow-sm` 到 `shadow-2xl` 不参与该端生成；Android/iOS 的任意值内阴影可生成。Tailwind 的阴影颜色、阴影 `/透明度`、`inset-shadow-*`、`ring-*` 与 `inset-ring-*` 目前依赖插件尚未完整适配的相对颜色或组合变量，只在 Web 展示。这是插件转换边界，不能据此判断 Android/iOS 不支持对应的 `box-shadow` 值。

App 的 min/max 尺寸不接受百分比，默认命名字间距使用的 em 也不直接支持，相关示例仅 Web 展示。App 移除背景模糊使用 `[backdrop-filter:none]`；`backdrop-blur-none` 的空变量组合只在 Web 展示。

Tailwind 的 Grid、分栏、滤镜、遮罩等不能只根据工具类名称判断为原生支持；`space-*`、`divide-*`、`hover:`、`focus:`、`group-*`、`peer-*` 等生成复杂选择器的写法还受插件默认 strict 过滤限制，本模板没有把它们当作已支持的实例。`md:` 等断点在 Web 保留媒体查询，不能作为 App 的响应式示例；本模板的 `dark:` 示例也仅 Web 展示。

已有 HBuilder V 5.33 配套 SDK 的原生 CSS 检查未保留 `lines`、`text-decoration-color`、`background-clip`、`letter-spacing: normal`、`color: currentColor`、`z-index: auto` 和角度渐变的有效声明。这些示例暂限制到 Web，并在属性说明中标出官方支持范围与当前编译边界。`lines` 在 Web 中用 `line-clamp-1` 到 `line-clamp-4` 工具类生成 `-webkit-line-clamp`，展示对应的多行截断效果。该记录仅对应实测 SDK，其他 HV 或 HX SDK 版本需分别验证。

Tailwind v4 的 `rotate-*`、`scale-*`、`translate-*` 生成独立的 CSS 属性；本示例使用 `[transform:rotate(20deg)]` 等任意属性语法对应官方支持的 `transform`。`text-[length:40rpx]` 与 `border-[length:12rpx]` 使用长度类型提示，避免被识别为颜色。

Node 检查覆盖六端 class 与声明生成，配套 SDK 检查覆盖原生 CSS 编译；它们不能代替设备上的字体、动画、事件与布局验收。
