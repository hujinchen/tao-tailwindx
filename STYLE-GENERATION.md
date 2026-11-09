# Tao Tailwind X 样式生成、隔离与迁移指南

适用版本：Tao Tailwind X 0.3.0。

本版本已落实“按文件局部生成，显式声明全局”。0.2.0 的使用路径分析与隐式全局行为不再适用。

## 1. 默认契约

`componentLocalStyles` 默认 `true`。页面和组件的完整 utility 候选进入各自的局部样式模块；App 作用域和公共 CSS 中显式收录的 utility 进入全局。

```js
uniAppXTailwind({
	entry: tailwindCss,
	componentLocalStyles: true
})
```

| 来源                                   | 输出位置                       |
| -------------------------------------- | ------------------------------ |
| 页面或组件 `.uvue` 的模板、脚本        | 当前 SFC 局部                  |
| SFC 引用的已扫描脚本模块               | 每个引用它的 SFC 的作用域      |
| 应用入口 `App.uvue` 及其脚本依赖       | 全局                           |
| 公共入口中的正向 `@source inline(...)` | 全局，局部用到时仍保留局部份额 |
| 应用入口导入的公共 CSS、主题、皮肤     | 随入口进入全局                 |
| 页面、组件自身的 CSS / SCSS            | 保持原模块，`@apply` 就地展开  |
| 仅被扫描、没有 SFC 使用者的独立脚本    | 不自动兜底全局                 |
| 只用于 `@apply` 的 utility             | 不额外生成独立 utility 选择器  |

公共 CSS 由应用入口的导入关系确定，不通过目录名猜测。局部 CSS 不因扩展名是 `.css` 就变成全局。

页面与组件使用同一套候选分配规则，`pages.json` 不再参与 utility 归属。应用入口按 `UNI_INPUT_DIR` 或 Vite root 下的实际 `App.uvue` 路径识别，其他目录中的同名组件仍按局部处理。

## 2. 文件归属不需要使用路径证明

插件直接收集模板和脚本中的完整 Tailwind 候选，再与实际生成的合法 utility 对照。style 块单独处理，不作为模板/脚本候选来源。

以下写法中的完整候选，都能归当前文件：

- 静态 `class`、`hover-class` 和其他属性中的完整类名。
- 对象、数组、`v-for` 成员中的完整字符串。
- 普通函数返回值、事件回调赋值、变量后续赋值。
- 不在 class 表达式分析器识别范围内的完整字符串。

例如项目自己的 `image.uvue` 页面：

```ts
const shapes = [
	{ label: '直角', className: 'rounded-none' },
	{ label: '圆角', className: 'rounded-xl' },
	{ label: '圆形', className: 'rounded-full' }
]
```

三个类名直接归 `image.uvue`。不需要先证明 `shape → shapes → className` 的循环数据流。

这仍然是 Tailwind 的文件级保守扫描。普通文案、注释、业务枚举恰好与 utility 同名时，可能额外收录局部规则；不会因为这种噪声自动增加全局 utility。独立声明文件和明确的类型导入不进入 SFC 脚本依赖归属。

`'mt-' + size` 没有完整候选，不能自动推导所有运行时结果。应把有限类名写成完整映射，或将真正的应用公共候选通过公共 CSS 显式收录。

候选归属与类名转换分开负责：脚本数据仍保持原值，在 `class`、`hover-class` 和通过 `customAttributes` 声明的自定义属性绑定处转换特殊字符。

## 3. 共享脚本的归属

```text
A.uvue → variants.ts       → A 的局部
B.uvue → variants.ts       → B 的局部
App.uvue → app-classes.ts  → 全局
```

沿已扫描源码的静态 import/re-export 建立文件依赖，支持 `.ts`、`.uts`、`.js`、`.mjs`、`.cjs`、`.tsx`、`.jsx`。在 Vite 中使用宿主解析链处理 alias、相对路径和扩展名。独立 Node 调用没有 Vite 上下文时，仅按已扫描的相对模块解析。

- 支持带字面量路径的动态 import，以及 SFC 的 `<script src>`。
- 跳过 `import type`、`export type` 和仅包含类型成员的导入/导出。
- 遇到另一个 SFC 就停止跨越，由那个 SFC 拥有自己的样式。
- 循环依赖只遍历一次；未变化文件的原始候选、import 和直接依赖路径跨入口编译复用。依赖记录只保存路径，遍历时使用本轮文件记录，避免共享脚本变更后沿用旧候选。
- 只接收 Tailwind 扫描范围内的脚本；将共享 class 表抽到独立文件时，也要让该文件进入 `@source` 范围。
- 文件级依赖会整体收录该模块的完整候选，不按导出成员做 tree shaking。小型 class 表宜直接导入，避免依赖大型聚合入口。
- 变量路径、运行时注册、事件传值等不能建立静态模块边。收集器是有限词法分析，不是完整 TypeScript 类型分析器；复杂类型表达式及模板插值中的动态 import 不作为已验证能力。
- 未分配来源仅在 `debug: true` 时列出，不自动兜底全局。Vite 无法解析明确的相对路径或 `@/` 依赖时报告错误。

共享次数不会触发自动全局提升。同一脚本有多个消费者时，每个消费者都拥有相应局部规则。

## 4. 扫描范围与全局声明

```css
/* 扫描页面；这些候选仍按页面分配。 */
@source './pages/**/*.uvue';

/* 明确要求保留这些全局工具类。 */
@source inline('mt-12 mx-12 mb-20');
```

文件型 `@source` 仅指定扫描范围。即使它写在应用全局 `tailwind.css`，也不表示其匹配文件的候选全部进入全局。正向 inline 支持嵌套备选和数值范围；`@source not inline(...)` 继续由 Tailwind 排除候选。

全局 utility 集合由两部分组成：

```text
G = App 作用域的候选 ∪ 公共 CSS 正向 inline 候选
L(file) = 当前 SFC 及其脚本依赖的候选
```

全局输出按 G 保留 utility，每个 SFC 按 L(file) 注入局部 utility。

构建先编译完整 Tailwind 输入，记录真实生成顺序和规则来源，再仅裁剪不属于 G 的 Tailwind utility 规则。不会按选择器名字删除手写公共 CSS；即使手写选择器恰好叫 `.mt-12`，它仍按原公共声明保留。

局部 utility 直接注入这次入口编译生成的 CSS 片段，不再生成中间 `@apply` 后逐 SFC 重编译。片段包含完整声明、重要号和目标端允许的媒体条件。手写 `@apply` 继续就地编译；同名公共规则不混入局部片段。

主题变量、RGB 通道、动画 keyframes 等基础依赖保留在公共编译结果中，也可能包含只被局部 utility 引用的定义。局部 `@apply` 的动画依赖继续由原编译链生成。这些基础定义与全局 utility 选择器是不同概念。保留它们是为了让局部样式有完整依赖，不能只追求 App CSS 文本最少。

## 5. 去重只在同一作用域内进行

| 用法                       | 结果                                    |
| -------------------------- | --------------------------------------- |
| A 页多处使用 `mt-12`       | A 页同一条件下生成一次                  |
| A 页、B 页各自使用 `mt-12` | 每页各一份                              |
| 组件 C 也使用 `mt-12`      | C 有自己的局部份额                      |
| 公共 CSS 同时声明 `mt-12`  | 全局再保留一份，不删除 A/B/C 的局部份额 |
| 同一组件渲染 100 个实例    | 按源码模块生成，不按实例生成 100 份     |

同名声明不会把 12px 相加成 24px。它们通过 CSS 级联与框架来源优先级参与计算。

不得采用“全局已经有，所以删除局部”的优化：隔离组件可能无法引用全局规则，删除局部也可能改变覆盖优先级。出现次数、模板 class 顺序和目录名都不是全局提升依据。

## 6. 局部模块与样式隔离

“局部”表示规则位于对应 SFC 样式模块，不要求全端使用相同的字面量 `<style scoped>`。

| 平台               | 注入策略                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Web                | 优先复用最后一个可用 scoped style，否则使用最后一个可用普通 style；没有可用块时新增 scoped style |
| App / 小程序       | 复用可用普通 style，否则新增普通 style；交由 uni-app x 隔离机制处理                              |
| SFC 存在外链 style | 保留外链，使用或追加独立的可用内联 style                                                         |
| CSS module style   | 不直接用作 utility 注入目标                                                                      |

保留普通类名和特殊字符的可读安全名，不引入按文件哈希的 alias，不自动添加 Web deep/global 选择器。

依据 [uni-app x 样式隔离 2.0](https://doc.dcloud.net.cn/uni-app-x/css/common/style-isolation.html)，组件内部普通 class 的可见范围如下：

| 配置           | 全局来源     | 所在页面来源 | 父组件局部来源 |
| -------------- | ------------ | ------------ | -------------- |
| `isolated`     | 不可直接引用 | 不可直接引用 | 不可直接引用   |
| `app`          | 可引用       | 不可直接引用 | 不可直接引用   |
| `app-and-page` | 可引用       | 可引用       | 不可直接引用   |

根节点 class/style 透传、已注册的 `externalClasses` 是另外的有效通道。同等条件下，`app-and-page` 组件的来源优先级为页面 > 组件 > 全局。

跨组件传入的类名按来源文件生成，能否生效取决于样式隔离和传递方式：

- 页面定制允许页面来源的组件内部：可使用页面局部规则。
- 父组件定制子组件根节点：使用根 class 透传。
- 父组件通过自定义属性定制子组件内部：需要明确公共样式来源，或者组件已有有效的 `externalClasses` 通道。
- 默认 isolated 组件：即使声明全局也不会自动穿透隔离。

微信产物中的 `[class]` 是 uni 编译器的页面来源提权形式；插件不手工添加该选择器，也不把它当作其他平台的统一规则。

## 7. 从 0.2.0 迁移

0.3.0 保持选项默认值为 true，但改变了生成契约。独立脚本和跨组件传入的类名不再自动进入全局，未知使用路径也不再兜底全局。

### 应用全局配置

如果消费项目在 `main.ts` 或其他共享脚本中维护应用级默认样式配置，在该项目的 Tailwind 入口中显式声明对应的公共候选：

```css
@source inline('mt-12 mx-12 mb-20');
```

应用级配置以后新增其他公共工具类时，应同步维护该集合。`@source './main.ts'` 本身不再授予全局归属。

### 跨组件内部样式

父组件通过自定义属性向子组件内部传入固定类名时，可在公共 Tailwind 入口声明：

```css
@source inline('text-[20px]! text-[16px]! text-[var(--icon-color)]!');
```

其中 `--icon-color` 由消费项目自己的主题 CSS 定义。声明全局候选只保证生成 CSS；子组件仍需允许全局样式来源，或提供有效的 `externalClasses` 通道。默认 `isolated` 组件不会因此获得样式穿透。

升级项目应核对同类用法，不能只升级插件而继续依赖旧的隐式全局。若要让所有跨组件内部定制完全不依赖公共 CSS，应另行设计并验证 externalClasses 契约。

### 关闭自动局部生成

`componentLocalStyles: false` 保留为全局 utility 模式。手写局部 CSS、局部 `@apply` 和绑定处类名转换保持原语义；该模式不绕过框架隔离。

## 8. HMR 与验证

插件维护脚本来源到 SFC 使用者的反向关系。SFC 更新刷新自身局部模块，共享脚本更新刷新所有消费者，公共 CSS/主题更新刷新已加载的局部样式。文件新增、删除和 import 关系变化也重新收集归属。首次出现局部 utility 且尚无 style 模块时，重新加载 SFC 创建样式块。

文件缓存按签名复用；watcher 明确通知变更时强制重读该文件。缓存保存原始候选，主题新增、删除和 `@source not inline(...)` 变化均重新筛选。文件增删、实际扫描集合或宿主 resolver 变化时重新解析依赖路径；缓存只保留本轮扫描记录。入口的版本检查同时保护文件缓存与样式归属，过期请求不能回写旧结果。

普通源码更新先比较原始候选、实体候选、`@apply` 候选及 import 集合。样式输入和扫描范围未变时，仅更新源码记录与文件签名，复用已完成的入口结果和 Tailwind 编译器；真实候选、主题、扫描配置或依赖变化仍重建。使用 `@config` / `@plugin` 的入口保守重建，不把脚本逻辑等同于 class 候选。并发检查完成后才发布新快照，较慢的旧扫描不能覆盖新结果。

手写 `@apply` 的静态表达式和去重后的任意值探针同批编译，每条表达式分别消费声明保护计数，保持声明顺序、重要号和关键帧。缓存 miss 后仍补取 Tailwind 重建后的依赖；watcher 明确通知依赖变化时定向清除对应缓存，即使文件大小与时间戳未变也重新编译。

运行时 class 整串只包含安全字符和空白时直接返回；特殊字符继续逐词转换，保留原有空白、数组和对象的处理规则。

目录与文件签名检查继续负责发现漏收的 watcher 事件。读取内容前保存签名，最新编译完成后清除待处理标记，防止局部样式先编译后跳过下一次入口检查。style-only 更新直接使用对应缓存记录确定注入位置。

全局和局部沿用真实 Tailwind 顺序；媒体条件在目标平台允许的范围内完整保留。Web 后置 HMR 钩子恢复 uni/Vue 按原始 style 比较时可能过滤掉的自动生成样式更新。

入口的原始类名登记、碰撞检查和 CSS 清洗合并为一次遍历，不再丢弃第一遍清洗结果。
源码记录先按签名收集，再供局部归属复用；HTML 实体解码新增的候选先扣除首次已生成的 utility，仅剩余候选触发补编译，不改变全局归属或扫描排除。
去重仅接受有 Tailwind 指令来源证据的完整单类选择器，CSS 转义还原后按原始候选精确比较；手写同名规则、关系选择器和伪类规则继续保守补编译，不增加完整 CSS 清洗次数。
脚本 import 提取遵循当前构建的条件编译上下文；HTML 条件注释与脚本、样式内容分别过滤，模板文案不进入 JavaScript 分词器。文件增删后仍清除旧解析路径。
完整 SFC、`@apply` 提取和 HMR 共用真实顶层 style 块识别，只选择当前平台生效的块，跳过注释、脚本字符串和未启用的分支。空块按 Vue 的忽略规则计数，自闭合目标转换为配对标签。
属性扫描完整消费非 class 属性及其值，保留事件处理中的业务字符串。含实体的动态绑定由 Vue 解码并求值，再通过运行时转换函数处理绑定值；原始条件和函数参数不重编码，转换函数只导入生效的真实脚本块。

颜色兼容转换保留声明顺序和 `!important`：RGB 通道逐条对应原变量，`@supports color-mix` 在原位置展开。
用途未知的自定义属性保留计算，具体属性的安全折叠继续生效。

### 验证方式

测试覆盖候选归属、共享脚本、条件编译、实体处理、`@apply`、类名转换、颜色与动画处理以及 HMR。

```bash
pnpm test
pnpm run format:check
pnpm run test:package
pnpm run test:package --npm
```

发布检查以 `test/demo-template/` 为模板，在生成的 uni-app x 工程中安装实际打包的 `tao-tailwindx`，检查公开 JS / CSS 入口，以及 Web、Android、iOS、HarmonyOS、微信和支付宝平台配置下的插件样式处理。默认输出到固定目录 `demo-output/demo-app/`，每次运行清空并重新生成；可通过 `UNIAPPX_RELEASE_HOST_PARENT` 修改输出父目录。
完整 Vite watcher 与原生动画 CSS 编译检查使用 HBuilder V（HV）或 HBuilderX（HX）对应的配套 SDK，配置方式见源码项目的 `PUBLISHING.md`；缺少编译器时相关测试会明确跳过，验证记录注明实际使用的 IDE 与 SDK 版本。
这些检查不代表完整消费项目或设备运行验收通过。消费项目应按实际目录、组件隔离、主题配置与目标端编译并运行验证；发布版本的验证记录见[更新日志](./CHANGELOG.md)。

主要实现入口：[候选与文件归属](./src/local-styles.mjs)、[脚本模块边](./src/script-imports.mjs)、[全局裁剪与 HMR](./src/index.mjs)、[绑定转换](./src/class-values.mjs)。局部生成与真实 Vite HMR 的回归位于源码项目的 `test/local-styles.test.mjs` 和 `test/dependencies.test.mjs`，测试文件不进入 npm 发布包。

## 9. 编译器属性与“重复 class”的精简边界

uni-app x 编译器与运行时会生成用于组件关系、插槽和样式隔离的字段。以下内容具有运行协议或作用域语义，不能仅因看起来重复就从产物中删除。具体输出随 SDK、平台与组件配置变化，应核对消费项目实际使用的编译器。

| 观察到的内容                                                   | 已确认的用途                                                                                            | 删除影响                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `u-i`，如 `7e9fd0fd-1,7e9fd0fd-0`                              | 组件自身 ID 与 Vue 父级 ID；运行时读取 `properties.uI`，通过 `initVueIds`、`findVmByVueId` 建立父子关系 | 可能错连插槽内组件的逻辑父级，影响父级访问、provide/inject 等能力 |
| `u-s="d"`                                                      | 插槽名称数据；运行时读取 `properties.uS` 初始化 slots，并维护 `$slots`                                  | 影响默认/具名插槽识别；依赖 `useSlots()` 的组件也会受影响         |
| `virtual-host-class`                                           | 运行时属性 `virtualHostClass` 的面板显示；将使用者的 class 传到虚拟宿主组件的真实根节点                 | 外部设置的根 class 可能失效                                       |
| `virtual-host-style`、`virtual-host-hidden`、`virtual-host-id` | 同一套根节点 style、显示状态和 ID 的透传                                                                | 破坏对应的根节点控制能力                                          |
| `pt-23 ^pt-23`                                                 | 当前来源与父组件来源的两种 class 引用；微信的 `^` 具有作用域语义                                        | 去掉前缀类可能丢失父组件局部样式；去掉原名可能破坏全局样式路径    |
| Web 的 `data-v-*`                                              | 组件、页面或插槽作用域的选择器标记                                                                      | 对应的 scoped CSS 无法匹配                                        |

例如页面向项目自己的布局组件传入 class：

```vue
<app-row class="mx-6! pt-23 justify-between">...</app-row>
```

微信虚拟宿主的 class 透传可能同时包含 `class` 和 `virtualHostClass`；框架通过 `pvhc(virtualHostClass)` 处理父层 class。`patchClassList()` 的前缀语义可用以下结果说明：

```text
输入：pt-23 justify-between
输出：pt-23 ^pt-23 justify-between ^justify-between

输入：pt-23 pt-23
输出：pt-23 ^pt-23
```

完全相同的 token 可以去重，带不同来源前缀的 token 则维护各自的作用域；原始类名也可能用于全局样式来源。相关平台语义见[微信组件样式文档](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html)及[uni-app x 样式隔离说明](https://doc.dcloud.net.cn/uni-app-x/css/common/style-isolation.html)。

运行时面板中的字符串长度不等于安装包新增的字节数，部分来源前缀在运行时生成。是否实际保存重复规则，应检查对应 WXML、WXSS、脚本与发行包。

### 包体处理原则

插件只处理 Tailwind 样式与 class 绑定，不删除框架生成的组件关系、插槽或虚拟宿主字段，也不修改 SDK 或关闭样式隔离。

需要评估包体时，应比较同一平台、SDK、构建配置下的发行产物，并核对消费项目的压缩与分包设置。不要把开发者工具的节点显示长度当作包体收益，也不要从一个平台的输出推断其他平台可安全删除相同字段。

### SDK 源码索引

以下路径相对于 HBuilder V 或 HBuilderX 对应配套 SDK 的 `plugins/uniapp-cli-vite/node_modules/@dcloudio/`，以实际使用的 SDK 版本为准：

- `uni-mp-weixin/dist/uni.mp.esm.js`：`initVueIds`、`findVmByVueId`、`initDefaultProps`、`initVirtualHostProps`、`initLifetimes`。
- `uni-mp-vue/dist-x/vue.runtime.esm.js`：`patchClassList`、`parseVirtualHostClass`。
- `uni-mp-compiler/dist/transforms/transformClass.js`：微信 uni-app x 与其他小程序的 class 透传分支。
- `uni-mp-compiler/dist/template/codegen.js`：`checkVirtualHostProps` 生成原属性及透传属性。
