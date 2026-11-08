# Tao Tailwind X CSS 用法示例

示例按 [uni-app x 官方 CSS 目录](https://doc.dcloud.net.cn/uni-app-x/css/align-content.html)整理，包含 110 项属性入口、636 个 Tailwind 写法，分为弹性布局、布局与层级、尺寸与间距、背景与效果、边框与圆角、文字排版、变换与动效、Web 扩展八类。

## 运行

此工程通过随工程附带的 npm tarball 安装插件。解压后执行 `pnpm install`，再用 HBuilder V 打开工程运行。正式发布后也可以执行 `pnpm add -D tao-tailwindx`。

源码仓库中先执行 `pnpm run test:package`，生成可运行的 `demo-output/demo-app/`。不要直接运行缺少 `package.json` 的模板目录。

## 查看与维护

- 首页支持按 CSS 属性名、中文用途或分类搜索。
- 每个属性都有独立的页面地址，例如 `/pages/css/property?name=align-content`。共用一个预览页面，避免复制 110 份布局和交互代码。
- 每张卡片显示完整 Tailwind class、对应 CSS 值和可观察的效果。有限枚举值逐项演示；长度、颜色、时间、数字等无限值类型使用代表值，简写使用常见组合。
- `pages/css/catalog.ts` 保存完整 class 字符串；插件可扫描这些静态候选，运行时在绑定处转换类名。不要拼接 `border-${value}` 等无法扫描的 class。
- `pages/css/property.uvue` 提供多行 Flex、尺寸参照、事件穿透、文字截断、可重新播放的动画和独立滚动时间轴等实际场景。
- 布局样式复用 `@apply`，主题通过 CSS 变量同时提供浅色和深色模式；不下载额外字体或图片。
- 此模板将 Tailwind `--spacing` 设置为 `1px`，所以 `p-16` 对应 `16px`，不是 Tailwind 默认间距尺度。

## 支持边界

首页显示当前编译目标的示例数量。平台条件既控制可见示例，也控制参与生成的 CSS 候选。App 动画需要 Vapor 5.31+，背景模糊需要 Vapor 5.25+；示例没有给这些对象设置 `flatten`。

官方 CSS 目录包含仅 Web 支持的属性和受限枚举，不能将全部目录视为所有端都支持。滚动驱动动画还取决于浏览器对对应 CSS 的支持。

当前 HBuilder V 5.33 配套 SDK 的原生 CSS 检查未保留 `lines`、`text-decoration-color`、`background-clip`、`letter-spacing: normal`、`color: currentColor`、`z-index: auto` 和角度渐变的有效声明。这些示例暂限制到 Web，并在属性说明中标出官方支持范围与当前编译边界。`lines` 在 Web 中用 `line-clamp-1` 到 `line-clamp-4` 工具类生成 `-webkit-line-clamp`，展示对应的多行截断效果。

Tailwind v4 的 `rotate-*`、`scale-*`、`translate-*` 生成独立的 CSS 属性；本示例使用 `[transform:rotate(20deg)]` 等任意属性语法对应官方支持的 `transform`。`text-[length:40rpx]` 与 `border-[length:12rpx]` 使用长度类型提示，避免被识别为颜色。

Node 检查覆盖六端 class 与声明生成，配套 SDK 检查覆盖原生 CSS 编译；它们不能代替设备上的字体、动画、事件与布局验收。
