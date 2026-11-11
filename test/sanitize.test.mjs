import assert from 'node:assert/strict'
import { test } from 'node:test'
import postcss from 'postcss'
import { sanitize as sanitizeCss } from '../src/sanitize.mjs'
import { foldCalculations } from '../src/calc.mjs'
import { toSafeClassName } from '../src/class-name.mjs'

const sanitize = (css, options = {}) => sanitizeCss(css, { foldCalculations: true, ...options })

test('宽松模式保留选择器引号内的逗号和空白', () => {
	const css = '.item[data-label="a, b"],.other[data-label="c, d"] { color: red; }'
	assert.equal(sanitize(css, { strict: false, nativeCss: false }).toString(), css)
})

test('清洗已有 AST 时保留声明来源，并保持输入 AST 不变', () => {
	const source = '.button { padding-inline: 12px; content: "x"; }'
	const input = postcss.parse(source, { from: 'component.css' })
	const output = sanitizeCss(input)
	assert.equal(input.toString(), source)
	assert.equal(output.first.first.source.input, input.first.first.source.input)
	assert.deepEqual(
		output.first.nodes.map((node) => [node.prop, node.value]),
		[
			['padding-left', '12px'],
			['padding-right', '12px']
		]
	)
})

test('默认清洗不计算未知来源 CSS', () => {
	const css = '.x { width: calc(1px * 2); border-radius: calc(infinity * 1px); }'
	assert.equal(sanitizeCss(css).toString(), css)
})

test('完整静态 calc 遵循优先级、括号和单位规则', () => {
	for (const [input, expected] of [
		['calc((2px + 3px) * 4 - 6px / 2)', '17px'],
		['calc(2 + 3 * 4)', '14'],
		['calc(calc(2rpx + 3rpx) / 2)', '2.5rpx'],
		['calc(1e2px + 2.5e-1px)', '100.25px'],
		['calc(2rem + 3rem)', '5rem'],
		['calc(25% + 50%)', '75%'],
		['calc(1px - 1px)', '0px'],
		['calc(-0px * 2)', '0px'],
		['calc(1px + 2px) calc(4rpx / 2)', '3px 2rpx'],
		['calc(infinity * 1rpx) 3.40282e38px', '9999rpx 9999px']
	])
		assert.equal(foldCalculations(input, 'width'), expected, input)
	assert.equal(foldCalculations('calc(-.5px * +3)', 'margin-left'), '-1.5px')
})

test('保留非负属性的 calc 钳制和整数属性的取整语义', () => {
	assert.equal(foldCalculations('calc(1px - 2px)', 'width'), 'calc(1px - 2px)')
	assert.equal(foldCalculations('calc(3 / 2)', 'z-index'), 'calc(3 / 2)')
})

test('用途未知的自定义属性保留计算，具体属性仍可静态折叠', () => {
	for (const value of ['calc(1px - 2px)', 'calc(3 / 2)', 'calc(2px * 4)', 'calc(infinity * 1px)'])
		assert.equal(foldCalculations(value, '--size'), value)
	assert.equal(foldCalculations('calc(2px * 4)', 'width'), '8px')
})

test('RGB 通道保留重复声明的顺序与 important，清洗可重复执行', () => {
	const css =
		'.x { --brand: #123456 !important; --brand: #abcdef; --alias: var(--brand) !important; --alias: var(--other); --other: #ffffff; }'
	const options = { colorVariables: ['--brand', '--other'] }
	const output = sanitize(css, options)
	assert.deepEqual(
		output.first.nodes
			.filter((node) => node.prop === '--brand-rgb')
			.map((node) => [node.value, !!node.important]),
		[
			['18,52,86', true],
			['171,205,239', false]
		]
	)
	assert.deepEqual(
		output.first.nodes
			.filter((node) => node.prop === '--alias-rgb')
			.map((node) => [node.value, !!node.important]),
		[
			['var(--brand-rgb)', true],
			['var(--other-rgb)', false]
		]
	)
	assert.equal(sanitize(output.toString(), options).toString(), output.toString())
	const explicit = sanitize('.x { --brand: #fff; --brand-rgb: 1,2,3; --brand: #000; }', options)
	assert.deepEqual(
		explicit.first.nodes
			.filter((node) => node.prop === '--brand-rgb')
			.map((node) => node.value),
		['1,2,3']
	)
})

test('color-mix 支持分支在原位置展开，不覆盖相邻声明或剥离 important', () => {
	const css =
		'.x { color: red !important; @supports (color: color-mix(in srgb, red, transparent)) { color: color-mix(in srgb, #fff 50%, transparent); } color: blue; }'
	const output = sanitize(css)
	assert.deepEqual(
		output.first.nodes.map((node) => [node.prop, node.value, !!node.important]),
		[
			['color', 'red', true],
			['color', 'rgba(255,255,255,0.5)', false],
			['color', 'blue', false]
		]
	)
	assert.equal(sanitize(css, { nativeCss: false }).toString(), css)
})

test('动态、非法或非有限 calc 整体保持原值', () => {
	for (const value of [
		'calc(var(--spacing, 2px) * 4)',
		'calc(env(safe-area-inset-top) + 2px)',
		'calc(var(--x) + calc(2px * 3))',
		'calc(1px + 1rpx)',
		'calc(1px + 0)',
		'calc(1px / 0)',
		'calc(0 / 0)',
		'calc(1e308 * 2)',
		'calc(1e999px)',
		'calc(2px * 3px)',
		'calc(2px / 1px)',
		'calc(2px+ 3px)',
		'calc(2px +3px)',
		'calc(2px + 3px garbage)',
		'calc(1.px * 2)',
		'calc(2foo + 3foo)',
		'calc(2px + min(1px, 2px))',
		'calc(2px /* comment */ + 3px)',
		'calc((2px + 3px)',
		'calc(2px +)',
		'calc()',
		`calc(${'('.repeat(100)}1px${')'.repeat(100)})`
	])
		assert.equal(foldCalculations(value, 'width'), value)
})

test('跳过字符串、注释、URL、未知函数和不完整函数名', () => {
	for (const value of [
		'"calc(1px * 2)"',
		"'calc(infinity * 1px)'",
		'/* calc(1px * 2) */',
		'url(calc(1px * 2))',
		'url("calc(1px * 2)")',
		'mycalc(1px * 2)',
		'min(calc(1px * 2), 3px)',
		'var(--x, calc(1px * 2))',
		'"3.40282e38px"',
		'x3.40282e38px',
		String.raw`c\alc(1px * 2)`
	])
		assert.equal(foldCalculations(value, 'width'), value)
})

test('圆角及用途未知的变量保留百分比 calc 语义', () => {
	for (const property of ['border-radius', 'border-top-left-radius', '--radius'])
		assert.equal(foldCalculations('calc(100% / 2)', property), 'calc(100% / 2)')
	assert.equal(foldCalculations('calc(4px / 2)', 'border-radius'), '2px')
})

test('官方支持的布局、文字、背景与动画声明保持值不变', () => {
	const css = `.supported {
		align-content: flex-start; align-items: center; align-self: stretch;
		flex-flow: row wrap; flex-basis: 50%; flex-grow: 1; flex-shrink: 0;
		position: absolute; top: 0; right: 0; bottom: 0; left: 0;
		min-width: 12px; max-height: 80%; margin: 2px 4px; padding: 6px 8px;
		background-image: linear-gradient(to right,#667eea,#764ba2);
		backdrop-filter: blur(8px); direction: rtl; box-sizing: border-box;
		font-weight: 600; font-family: demo; font-style: italic; line-height: 1.5;
		letter-spacing: 2px; text-shadow: 1px 1px 2px #000; text-decoration-line: underline;
		white-space: nowrap; text-overflow: ellipsis; visibility: visible;
		pointer-events: none; overflow: hidden; z-index: 2;
		color: var(--brand); border-radius: 12px; transform: rotate(10deg);
		transform-origin: center; transition: opacity 200ms linear;
		animation: pulse 1s linear infinite; animation-name: pulse;
		animation-delay: 100ms; animation-direction: alternate; animation-duration: 1s;
		animation-fill-mode: both; animation-iteration-count: infinite;
		animation-play-state: paused; animation-timing-function: linear;
	}`
	for (const nativeCss of [true, false])
		assert.equal(sanitize(css, { nativeCss }).toString(), css)
})

test('App 阴影工具类解析本地 Tailwind 阴影变量', () => {
	const css = `.shadow-xl {
		--tw-shadow: 0 20px 25px -5px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
	}`
	const output = sanitize(css).toString()
	assert.match(output, /box-shadow:\s*0 20px 25px -5px rgba\(0,0,0,0\.1\)/)
	assert.doesNotMatch(output, /--tw-shadow-color/)
	assert.match(output, /--tw-shadow:.*rgba\(0,0,0,0\.1\)/)
	assert.equal(sanitize(css, { nativeCss: false }).toString(), css)

	const initialized = sanitize(
		`${css}\n.shadow-md { --tw-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow); }`
	).toString()
	assert.match(initialized, /box-shadow:\s*0 4px 6px -1px rgba\(0,0,0,0\.1\)/)
})

test('关键帧保留 from、to、百分比选择器及关键帧样式', () => {
	const css = '@keyframes fade { from { opacity: 0; } 50%, to { opacity: 1; } }'
	assert.equal(sanitize(css).toString(), css)
})

test('仅还原已确认的 Tailwind 关键帧及直接引用，保留手写动画作用域与动态变量', () => {
	const css = `:root { --animate-bounce: bounce 1s infinite; }
.slow { --animate-bounce: bounce 3s infinite; }
.bounce[data-v-abc123] { animation: var(--animate-bounce); }
.direct[data-v-abc123] { animation: bounce-abc123 2s steps(2, end), manual-abc123 1s; animation-name: bounce-abc123, manual-abc123; }
@keyframes bounce-abc123 { 0%, 100% { transform: translateY(-25%); } 50% { transform: none; } }
@-webkit-keyframes bounce-abc123 { to { transform: none; } }
@keyframes manual-abc123 { to { opacity: 0.2; } }
@keyframes other-def456 { to { opacity: 0; } }`
	for (const nativeCss of [false, true]) {
		const output = sanitizeCss(
			css,
			{ nativeCss, scopeId: 'abc123', tailwindKeyframes: new Set(['bounce']) },
			'App.uvue?vue&type=style&scoped=abc123&lang.css'
		).toString()
		assert.match(output, /@keyframes bounce \{/)
		assert.match(output, /@-webkit-keyframes bounce \{/)
		assert.match(output, /animation: var\(--animate-bounce\)/)
		assert.match(output, /--animate-bounce: bounce 3s infinite/)
		assert.match(output, /animation: bounce 2s steps\(2, end\), manual-abc123 1s/)
		assert.match(output, /animation-name: bounce, manual-abc123/)
		assert.match(output, /@keyframes manual-abc123/)
		assert.match(output, /@keyframes other-def456/)
		assert.doesNotMatch(output, /bounce-abc123|data-v-/)
	}
	assert.match(sanitizeCss(css).toString(), /@keyframes bounce-abc123/)
	assert.match(sanitizeCss(css, { scopeId: 'abc123' }).toString(), /@keyframes bounce-abc123/)
})

test('Web 保留变量、颜色函数、逻辑属性、媒体查询及特性查询', () => {
	const css =
		'@media (width >= 40rem) { .x { display: grid; padding-inline: 2px 4px; width: calc(50% - 8px); color: oklch(50% 0.1 20); font-weight: var(--font-weight-bold); @supports (color: color-mix(in srgb, red, blue)) { color: color-mix(in srgb, red, blue); } } }'
	assert.equal(sanitize(css, { nativeCss: false, preserveMedia: true }).toString(), css)
})

test('App 边框宽度工具类保留 solid 默认值与其他 class 的样式覆盖', () => {
	const css = `@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }
.border-t-4 { border-top-style: var(--tw-border-style); border-top-width: 4px; }
.border-dashed { --tw-border-style: dashed; border-style: dashed; }
.custom { border-left-style: var(--tw-border-style, dotted); border-right-style: var(--custom-style); }`
	const root = sanitize(css)
	assert.equal(
		root.nodes.some((node) => node.type === 'atrule'),
		false
	)
	assert.equal(root.first.first.value, 'var(--tw-border-style, solid)')
	assert.equal(root.first.last.value, '4px')
	assert.equal(root.nodes[1].first.value, 'dashed')
	assert.equal(root.nodes[1].last.value, 'dashed')
	assert.equal(root.last.first.value, 'var(--tw-border-style, dotted)')
	assert.equal(root.last.last.value, 'var(--custom-style)')
	// 重复清洗不叠加默认值，Web 继续使用 Tailwind 原生的 @property 注册。
	assert.equal(sanitize(root).toString(), root.toString())
	assert.equal(sanitize(css, { nativeCss: false }).toString(), css)
})

test('字重变量保留根、主题和媒体作用域，不以内联常量覆盖运行时引用', () => {
	const css = `page { --font-weight-bold: 700; }
.light { --font-weight-bold: 500; }
@media (prefers-color-scheme: dark) { .dark { --font-weight-bold: 900; } }
.font-bold { font-weight: var(--font-weight-bold); }
.fallback { font-weight: var(--font-weight-bold, 600); }`
	for (const nativeCss of [true, false]) {
		const result = sanitize(css, { nativeCss, preserveColorSchemeMedia: true }).toString()
		assert.equal(result, css)
	}
})

test('App 展开 Tailwind backdrop 空回退链，直接 blur 写法不改写', () => {
	const result = sanitize(
		'.blur { --tw-backdrop-blur: blur(8px); backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-contrast,); }'
	).toString()
	assert.match(result, /backdrop-filter: blur\(8px\)/)
	assert.doesNotMatch(result, /var\(--tw-backdrop/)
})

test('保留纯类名规则并限定根变量作用域', () => {
	const output = sanitize(`
@layer theme {
	:root { --color-brand: red; }
}
@layer utilities {
	.text-red { color: red; }
	.parent .child { color: blue; }
	.button:hover { color: green; }
}
	`)
		.toString()
		.replace(/\s+/g, '')
		.replace(/;}/g, '}')

	assert.match(output, /page\{--color-brand:red\}/)
	assert.match(output, /\.text-red\{color:red\}/)
	assert.doesNotMatch(output, /parent|button:hover/)
})

test('将根变量作用域限定到 uni-app x 页面选择器', () => {
	const output = sanitize(':root { --color-brand: red; }').toString()

	assert.match(output, /page\s*\{[^}]*--color-brand:\s*red/)
})

test('Web 后置清洗不把已编译的标准根选择器改回 page', () => {
	const output = sanitize(':root { --font-weight-bold: 700; }', {
		preserveRootSelectors: true
	}).toString()

	assert.match(output, /:root\s*\{[^}]*--font-weight-bold:\s*700/)
})

test('各端编译前的 page 根规则保持不变', () => {
	const css = 'page { --app-primary: #1677ff; }'
	for (const nativeCss of [true, false])
		assert.equal(sanitize(css, { nativeCss }).toString(), css)
})

test('Web 后置清洗保留框架页面规则、变量和作用域，仍过滤其他不支持的选择器', () => {
	const css =
		'uni-page-body[data-v-abc123] { --brand: red; height: 100%; } body { --brand: red; }'
	const options = { nativeCss: false, preserveRootSelectors: true, preserveVueScope: true }
	assert.equal(sanitize(css, options).toString(), css)
	assert.equal(sanitize(css).toString(), '')
	assert.equal(sanitize(css, { nativeCss: false }).toString(), '')
	for (const selector of ['view', 'body .child', 'uni-page-body:hover', 'body[data-other]'])
		assert.equal(sanitize(`${selector} { color: red; }`, options).toString(), '', selector)
})

test('所有平台都保留明暗配色方案媒体查询', () => {
	for (const nativeCss of [true, false]) {
		const output = sanitize(
			'@media (prefers-color-scheme: light) { page { --app-primary: #1677ff; } }' +
				'@media (prefers-color-scheme: dark) { page { --app-primary: #3d8fff; } }',
			{ nativeCss, preserveColorSchemeMedia: true }
		).toString()

		assert.match(output, /@media\s*\(prefers-color-scheme:\s*light\)/)
		assert.match(output, /@media\s*\(prefers-color-scheme:\s*dark\)/)
		assert.match(output, /--app-primary:\s*#1677ff/)
		assert.match(output, /--app-primary:\s*#3d8fff/)
	}
})

test('仍移除响应式媒体查询', () => {
	const output = sanitize('@media (width >= 40rem) { .sm-only { color: red; } }', {
		preserveColorSchemeMedia: true
	}).toString()

	assert.equal(output, '')
})

test('可以显式移除关键帧和动画声明', () => {
	const output = sanitize(
		`
@keyframes spin { from { transform: rotate(0deg); } }
.motion { animation: spin 1s; color: red; }
	`,
		{ removeKeyframes: true, removeAnimations: true }
	)
		.toString()
		.replace(/\s+/g, '')
		.replace(/;}/g, '}')

	assert.doesNotMatch(output, /keyframes|animation/)
	assert.match(output, /\.motion\{color:red\}/)
})

test('Web 组件样式可以保留关键帧', () => {
	const output = sanitize('@keyframes spin { 0% { opacity: 0; } }', {
		removeKeyframes: false
	}).toString()

	assert.match(output, /@keyframes spin/)
	assert.match(output, /0%\s*\{\s*opacity: 0/)
})

test('Web 组件样式可以保留动画声明', () => {
	const output = sanitize('.spinner { animation: spin 1s linear infinite; }', {
		removeAnimations: false
	}).toString()

	assert.match(output, /animation:\s*spin 1s linear infinite/)
})

test('为 uni-app x 平台换算保留 rem 值', () => {
	const output = sanitize('.text-base { font-size: 1rem; line-height: 1.5rem; }')
		.toString()
		.replace(/\s+/g, '')

	assert.match(output, /font-size:1rem/)
	assert.match(output, /line-height:1.5rem/)
})

test('规范化 Tailwind 像素计算和透明度百分比', () => {
	const output = sanitize(
		'.x { padding: calc(1px * 12); opacity: 60%; top: calc(1 / 2 * 100%); }'
	).toString()

	assert.match(output, /padding:\s*12px/)
	assert.match(output, /opacity:\s*0\.6/)
	assert.match(output, /top:\s*50%/)
})

test('规范化展开后的逻辑属性中的 Tailwind 计算', () => {
	const output = sanitize('.x { padding-inline: calc(1px * 12); }').toString()

	assert.match(output, /padding-left:\s*12px/)
	assert.match(output, /padding-right:\s*12px/)
})

test('App 双值轴向间距分别展开到两侧', () => {
	const output = sanitize(
		'.spacing { padding-inline: 2px 4px; margin-block: var(--top, 2px) 8px; }'
	).toString()
	assert.match(output, /padding-left: 2px; padding-right: 4px/)
	assert.match(output, /margin-top: var\(--top, 2px\); margin-bottom: 8px/)
})

test('规范化两种乘法顺序且不改变 rpx 语义', () => {
	const output = sanitize(
		'.x { a: calc(1px * 2); b: calc(2 * 1px); c: calc(1rpx * 3); d: calc(3 * 1rpx); }'
	).toString()

	assert.match(output, /a:\s*2px/)
	assert.match(output, /b:\s*2px/)
	assert.match(output, /c:\s*3rpx/)
	assert.match(output, /d:\s*3rpx/)
})

test('自定义 spacing 支持非 1 像素基数、小数、负值和 rpx', () => {
	const source =
		'.x { padding: calc(2px * 30); margin-left: calc(-3 * 2.5px); width: calc( .5rpx * 3 ); height: calc(4 * 2rpx); }'
	const output = sanitize(source).toString()
	assert.match(output, /padding:\s*60px/)
	assert.match(output, /margin-left:\s*-7\.5px/)
	assert.match(output, /width:\s*1\.5rpx/)
	assert.match(output, /height:\s*8rpx/)
	assert.doesNotMatch(output, /calc\(/)
	assert.match(sanitize(source, { nativeCss: false }).toString(), /calc\(2px \* 30\)/)
})

test('规范化任意值工具类中的计算', () => {
	const output = sanitize('.-mr-\\[1px\\] { margin-right: calc(1px * -1); }').toString()

	assert.match(output, /margin-right:\s*-1px/)
})

test('保留任意值声明', () => {
	const output = sanitize('.w-1rem { width: 1rem; }', { preserveAllValues: true }).toString()

	assert.match(output, /width:\s*1rem/)
})

test('规范化分数百分比计算', () => {
	const output = sanitize('.x { width: calc(3 / 4 * 100%); }').toString()

	assert.match(output, /width:\s*75%/)
})

test('从 Tailwind 选择器移除 Vue 作用域属性', () => {
	const output = sanitize('.text-lg[data-v-abc123] { font-size: 1.125rem; }')
		.toString()
		.replace(/\s+/g, '')

	assert.match(output, /\.text-lg\{font-size:1\.125rem;\}/)
})

test('Web scoped CSS 保留 Vue 作用域属性并按基础 class 校验', () => {
	const output = sanitize('.mt-12[data-v-abc123] { margin-top: 12px; }', {
		preserveVueScope: true
	}).toString()

	assert.match(output, /\.mt-12\[data-v-abc123\]\s*\{/)
})

test('根规则统一为 page 时保留要求保留的 Vue 作用域', () => {
	const expected = 'page[data-v-abc123] { --app-primary: #1677ff; }'
	for (const selector of ['page', ':root'])
		assert.equal(
			sanitize(`${selector}[data-v-abc123] { --app-primary: #1677ff; }`, {
				preserveVueScope: true
			}).toString(),
			expected
		)
})

test('启用时保留官方 dark 变体选择器', () => {
	const output = sanitize('.dark\\:text-white:where(.dark, .dark *) { color: white; }', {
		allowDarkVariantSelectors: true
	}).toString()

	assert.ok(output.includes(`.${toSafeClassName('dark:text-white')}:where(.dark, .dark *)`))
})

test('原生 Vapor 默认移除官方 dark 变体选择器', () => {
	const output = sanitize('.dark\\:text-white:where(.dark, .dark *) { color: white; }').toString()

	assert.equal(output, '')
})

test('规范化 Vapor 不支持的嵌套 Tailwind 值', () => {
	const output = sanitize(
		`
.container { width: 100%; @media (width >= 40rem) { max-width: 40rem; } }
.rounded-full { border-radius: calc(infinity * 1px); outline-radius: 3.40282e38px; }
.block { display: block; }
.bg-\\[\\#fff\\] { background-color: #fff; }
.spacing { margin-inline: 12px; margin-block: 8px; padding-inline: 10px; padding-block: 6px; }
.resize { resize: both; }
	`,
		{ allowEscapedSelectors: true }
	)
		.toString()
		.replace(/\s+/g, '')

	assert.doesNotMatch(output, /max-width:40rem/)
	assert.match(output, /border-radius:9999px/)
	assert.match(output, /margin-left:12px;margin-right:12px/)
	assert.match(output, /margin-top:8px;margin-bottom:8px/)
	assert.match(output, /padding-left:10px;padding-right:10px/)
	assert.match(output, /padding-top:6px;padding-bottom:6px/)
	assert.doesNotMatch(output, /display:block|resize|3\.40282e38/)
	assert.ok(output.includes(`.${toSafeClassName('bg-[#fff]')}{background-color:#fff;}`))
})

test('移除无效的 CSS 占位值', () => {
	const output = sanitize(`
.bg { background-color: #...; }
.bg-valid { background-color: #fff; }
`).toString()

	assert.doesNotMatch(output, /#\.\.\./)
	assert.match(output, /\.bg-valid\s*\{\s*background-color:\s*#fff/)
})

test('保留 Tailwind 转义的任意值及 important 类选择器', () => {
	const output = sanitize(
		`
.text-\\[\\#fff\\] { color: #fff; }
.text-\\[var\\(--app-foreground-muted\\)\\] { color: red; }
.rounded-full\\! { border-radius: 12px; }
.w-3\\/4 { width: 75%; }
	`,
		{ allowEscapedSelectors: true }
	)
		.toString()
		.replace(/\s+/g, '')
		.replace(/;}/g, '}')

	assert.ok(output.includes(`.${toSafeClassName('text-[#fff]')}{color:#fff}`))
	assert.ok(
		output.includes(`.${toSafeClassName('text-[var(--app-foreground-muted)]')}{color:red}`)
	)
	assert.ok(output.includes(`.${toSafeClassName('rounded-full!')}{border-radius:12px}`))
	assert.ok(output.includes(`.${toSafeClassName('w-3/4')}{width:75%}`))
})

test('原生 Vapor CSS 默认规范化转义类选择器', () => {
	const output = sanitize('.w-3\\/4 { width: 75%; }').toString()

	assert.equal(output, '.w-3-4 { width: 75%; }')
})

test('短名保留已确认的正负值及小数 selector 和声明', () => {
	const input = String.raw`
.-mt-\[1px\] { margin-top: -1px; }
.mt-\[1px\] { margin-top: 1px; }
.mt-\[-1px\] { margin-top: -1px; }
.w-\[1\.5px\] { width: 1.5px; }
.w-\[1-5px\] { width: 1-5px; }
.p-1\.5 { padding: 1.5px; }
.p-1-5 { padding: 5px; }
`
	const root = sanitize(input)
	assert.deepEqual(
		root.nodes.map((rule) => [rule.selector, rule.first.prop, rule.first.value]),
		[
			['.-mt-1px', 'margin-top', '-1px'],
			['.mt-1px', 'margin-top', '1px'],
			['.mt-neg-1px', 'margin-top', '-1px'],
			['.w-1dot5px', 'width', '1.5px'],
			['.w-1-5px', 'width', '1-5px'],
			['.p-1dot5', 'padding', '1.5px'],
			['.p-1-5', 'padding', '5px']
		]
	)
	assert.equal(sanitize(root.toString()).toString(), root.toString())
})

test('将 Tailwind oklab 颜色转换为原生 rgba', () => {
	const output = sanitize(
		'.text-white\\/70\\! { color: oklab(100% 0 5.96046e-8 / .7) !important; }',
		{ allowEscapedSelectors: true }
	)
		.toString()
		.replace(/\s+/g, '')

	assert.match(output, /color:rgba\(255,255,255,.7\)!important/)
	assert.doesNotMatch(output, /oklab/)
})

test('将 Tailwind color-mix 透明度转换为原生 rgba', () => {
	const output = sanitize(
		'.text-white-70-important { color: color-mix(in oklab, #ffffff 70%, transparent); }'
	)

	assert.match(output.toString().replace(/\s+/g, ''), /color:rgba\(255,255,255,0\.7\)/)
})

test('将 rgb color-mix 透明度转换为原生 rgba', () => {
	const output = sanitize(
		'.text-blue-600-75 { color: color-mix(in srgb, rgb(21,93,252) 75%, transparent); }'
	).toString()

	assert.match(output.replace(/\s+/g, ''), /color:rgba\(21,93,252,0\.75\)/)
})

test('移除不支持的嵌套 at 规则并转换 srgb 透明度', () => {
	const output = sanitize(`
.text-white-70-important {
	color: color-mix(in srgb, #fff 70%, transparent) !important;
	@supports (color: color-mix(in lab, red, red)) {
		color: color-mix(in oklab, var(--color-white) 70%, transparent) !important;
	}
}`).toString()

	assert.match(output, /color:\s*rgba\(255,255,255,0\.7\)\s*!important/)
	assert.doesNotMatch(output, /color-mix|@supports/)
})

test('显式颜色通道转换透明度，保留宿主颜色变量', () => {
	const output = sanitize(
		`
:root { --color-blue-600: #155dfc; }
.text-blue-600-75 { color: color-mix(in oklab, var(--color-blue-600) 75%, transparent); }
`,
		{ colorVariables: ['--color-blue-600'] }
	).toString()

	assert.match(output, /color:\s*rgba\(var\(--color-blue-600-rgb\),0\.75\)/)
	assert.doesNotMatch(output, /color-mix|oklch/)
})

test('标准颜色工具类保留宿主可覆盖的颜色变量', () => {
	const output = sanitize(`
:root { --color-red-300: rgb(255,162,162); }
.text-red-300 { color: var(--color-red-300); }
`).toString()

	assert.match(output, /color:\s*var\(--color-red-300\)/)
})

test('转换 Tailwind color-mix 回退值中的主题变量透明度', () => {
	const output = sanitize(
		`
page {
	--app-primary: #1677ff;
	--app-warning: #fa8c16;
	--color-primary: var(--app-primary);
}
.skin-red { --app-primary: #fa2c19; }
.text-primary-20 {
	color: var(--app-primary);
	@supports (color: color-mix(in lab, red, red)) {
		color: color-mix(in oklab, var(--app-primary) 44%, transparent);
	}
}
.text-warning-30 {
	color: var(--app-warning);
	@supports (color: color-mix(in lab, red, red)) {
		color: color-mix(in oklab, var(--app-warning) 30%, transparent);
	}
}
`,
		{ colorVariables: [/^--app-[\w-]+$/] }
	).toString()

	assert.match(output, /--app-primary-rgb:\s*22,119,255/)
	assert.match(output, /--app-primary-rgb:\s*250,44,25/)
	assert.match(output, /color:\s*rgba\(var\(--app-primary-rgb\),0\.44\)/)
	assert.match(output, /--app-warning-rgb:\s*250,140,22/)
	assert.match(output, /color:\s*rgba\(var\(--app-warning-rgb\),0\.3\)/)
	assert.doesNotMatch(output, /color-mix|oklab/)
	assert.match(output, /--color-primary:\s*var\(--app-primary\)/)
})

test('局部 App 样式使用全局注入的主题 RGB 通道转换透明度', () => {
	const colorVariables = [/^--app-[\w-]+$/]
	const appCss = sanitize('page { --app-primary: #1677ff; }', { colorVariables }).toString()
	const localCss = sanitize(
		`.bg-primary-50 {
			background-color: var(--app-primary);
			@supports (color: color-mix(in oklab, red, transparent)) {
				background-color: color-mix(in oklab, var(--app-primary) 50%, transparent);
			}
		}`,
		{ colorVariables }
	).toString()

	assert.match(appCss, /--app-primary-rgb:\s*22,119,255/)
	assert.match(localCss, /background-color:\s*rgba\(var\(--app-primary-rgb\),0\.5\)/)
	assert.doesNotMatch(localCss, /color-mix|@supports/)
})

test('将 Tailwind oklch 颜色转换为原生 rgb', () => {
	const output = sanitize('.text-red-200 { color: oklch(88.5% 0.062 18.334); }').toString()

	assert.match(output, /color:\s*rgb\(255,201,201\)/)
})

test('将无色相的中性 oklch fallback 转换为原生 rgb', () => {
	const output = sanitize(
		'.bg-neutral-600 { background-color: var(--color-neutral-600, oklch(43.9% 0 none)); }'
	).toString()

	assert.match(output, /background-color:\s*var\(--color-neutral-600, rgb\(82,82,82\)\)/)
	assert.doesNotMatch(output, /oklch/)
})

test('显式颜色变量与别名保留不同作用域的动态透明度', () => {
	const css = `page { --brand: #123456; --color-brand: var(--brand); }
	.night { --brand: #abcdef; }
	.label { color: var(--color-brand); background-color: color-mix(in srgb, var(--color-brand) 50%, transparent); }`
	const output = sanitize(css, { colorVariables: ['--brand'] }).toString()
	assert.match(output, /--brand-rgb:\s*18,52,86/)
	assert.match(output, /--brand-rgb:\s*171,205,239/)
	assert.match(output, /color:\s*var\(--color-brand\)/)
	assert.match(output, /--color-brand-rgb:\s*var\(--brand-rgb\)/)
	assert.match(output, /background-color:\s*rgba\(var\(--color-brand-rgb\),0\.5\)/)
	assert.doesNotMatch(sanitize(css).toString(), /--brand-rgb/)
	assert.equal(sanitize(css, { nativeCss: false, colorVariables: ['--brand'] }).toString(), css)
})

test('颜色变量正则的全局状态不影响多个作用域', () => {
	const pattern = /^--brand$/g
	const output = sanitize('page { --brand: #123456; } .night { --brand: #abcdef; }', {
		colorVariables: [pattern]
	}).toString()
	assert.equal((output.match(/--brand-rgb:/g) ?? []).length, 2)
	assert.equal(pattern.lastIndex, 0)
})

test('显式选择 --color 变量时不静态固化到最后一个作用域', () => {
	const output = sanitize(
		'page { --color-brand: #123456; } .night { --color-brand: #abcdef; } .label { color: var(--color-brand); }',
		{ colorVariables: ['--color-brand'] }
	).toString()
	assert.match(output, /color:\s*var\(--color-brand\)/)
})

test('颜色变量在 class、媒体查询和 Tailwind 主题中均保留运行时引用', () => {
	for (const declarations of [
		'.light { --color-brand: #fff; } .dark { --color-brand: #000; }',
		'page { --color-brand: #fff; } @media (prefers-color-scheme: dark) { page { --color-brand: #000; } }',
		'@theme { --color-brand: #fff; } .dark { --color-brand: #000; }'
	]) {
		const css = `${declarations} .text-brand { color: var(--color-brand); }`
		const output = sanitize(css, { preserveColorSchemeMedia: true }).toString()
		assert.match(output, /\.text-brand\s*\{ color: var\(--color-brand\); \}/)
		assert.doesNotMatch(output, /\.text-brand\s*\{ color: #/)
	}
})

test('显式颜色覆盖不能静默丢失 alpha 或继承其他作用域的通道', () => {
	for (const value of ['#ff000080', '#f008', 'rgba(255,0,0,0.5)', 'var(--other)']) {
		assert.throws(
			() =>
				sanitize(`page { --brand: #123456; } .night { --brand: ${value}; }`, {
					colorVariables: ['--brand']
				}),
			/每个作用域/
		)
	}
})

test('将任意值 important 选择器规范化为安全类名', () => {
	const output = sanitize('.bg-\\[rgba\\(0\\,0\\,0\\,0\\.2\\)\\]\\! { opacity: 0.5 !important; }')
		.toString()
		.replace(/\s+/g, '')

	assert.ok(
		output.includes(`.${toSafeClassName('bg-[rgba(0,0,0,0.2)]!')}{opacity:0.5!important;}`)
	)
})
