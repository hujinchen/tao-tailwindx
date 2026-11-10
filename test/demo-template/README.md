# Tao Tailwind X CSS 用法示例

示例按 [uni-app x 官方 CSS 目录](https://doc.dcloud.net.cn/uni-app-x/css/align-content.html)整理，包含 110 项属性入口、636 个 Tailwind 写法，分为弹性布局、布局与层级、尺寸与间距、背景与效果、边框与圆角、文字排版、变换与动效、Web 扩展八类。

## 运行

此工程通过随工程附带的 npm tarball 安装插件。解压后执行 `pnpm install`，再用 HBuilder V（HV）或 HBuilderX（HX）打开工程运行。正式发布后也可以执行 `pnpm add -D tao-tailwindx`。

使用目标 IDE 配套的 uni-app x 编译器 5.31+，App 启用 Vapor。

源码仓库中先执行 `pnpm run test:package`，生成可运行的 `demo-output/tailwind-uniappx-demo/`。不要直接运行缺少 `package.json` 的模板目录。

## 查看与维护

- 首页支持按 CSS 属性名、中文用途或分类搜索。
- 每个属性都有独立的页面地址，例如 `/pages/css/property?name=align-content`。共用一个预览页面，避免复制 110 份布局和交互代码。
- 每张卡片显示完整 Tailwind class、对应 CSS 值和可观察的效果。有限枚举值逐项演示；长度、颜色、时间、数字等无限值类型使用代表值，简写使用常见组合。
- `pages/css/catalog.ts` 保存完整 class 字符串；插件可扫描这些静态候选，运行时在绑定处转换类名。不要拼接 `border-${value}` 等无法扫描的 class。
- `pages/css/property.uvue` 提供多行 Flex、尺寸参照、事件穿透、文字截断、可重新播放的动画和独立滚动时间轴等实际场景。
- 边框预览只补齐当前方向缺少的宽度、样式或颜色；单边示例不叠加其他方向的边框。预览对象使用主题底色和字色，避免蓝色边框与蓝色背景混在一起。
- 组件属性遵循 uni-app x 文档；输入框不使用 `aria-label`，代码文本使用 `user-select` 支持选择和复制。
- 布局样式复用 `@apply`，主题通过 CSS 变量同时提供浅色和深色模式；不下载额外字体或图片。
- 此模板将 Tailwind `--spacing` 设置为 `1px`，间距、尺寸、定位和行高中的 px 值优先使用 `p-16`、`w-112`、`top-40`、`leading-32` 等数字工具类；字号、圆角、rpx、变量和计算值保留必要的任意值写法。

## 支持边界

首页显示当前编译目标的示例数量。平台条件既控制可见示例，也控制参与生成的 CSS 候选。App 动画需要 Vapor 5.31+，背景模糊需要 Vapor 5.25+；示例没有给这些对象设置 `flatten`。

官方 CSS 目录包含仅 Web 支持的属性和受限枚举，不能将全部目录视为所有端都支持。滚动驱动动画还取决于浏览器对对应 CSS 的支持。

已有 HBuilder V 5.33 配套 SDK 的原生 CSS 检查未保留 `lines`、`text-decoration-color`、`background-clip`、`letter-spacing: normal`、`color: currentColor`、`z-index: auto` 和角度渐变的有效声明。这些示例暂限制到 Web，并在属性说明中标出官方支持范围与当前编译边界。`lines` 在 Web 中用 `line-clamp-1` 到 `line-clamp-4` 工具类生成 `-webkit-line-clamp`，展示对应的多行截断效果。该记录仅对应实测 SDK，其他 HV 或 HX SDK 版本需分别验证。

Tailwind v4 的 `rotate-*`、`scale-*`、`translate-*` 生成独立的 CSS 属性；本示例使用 `[transform:rotate(20deg)]` 等任意属性语法对应官方支持的 `transform`。`text-[length:40rpx]` 与 `border-[length:12rpx]` 使用长度类型提示，避免被识别为颜色。

Node 检查覆盖六端 class 与声明生成，配套 SDK 检查覆盖原生 CSS 编译；它们不能代替设备上的字体、动画、事件与布局验收。
