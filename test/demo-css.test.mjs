import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes, createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import postcss from 'postcss'
import { uniAppXTailwind } from '../src/index.mjs'
import { toSafeClassName } from '../src/class-name.mjs'
import { createConditionContext, filterConditions } from '../src/conditions.mjs'

const fixture = fileURLToPath(new URL('./demo-template/', import.meta.url))
const catalogPath = fixture + 'pages/css/catalog.ts'

async function readCatalog(platform) {
	const source = filterConditions(
		await readFile(catalogPath, 'utf8'),
		createConditionContext(platform),
		catalogPath
	)
	const code = stripTypeScriptTypes(source, { mode: 'strip' })
	return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')))
		.cssDemos
}

test('命名颜色、容器尺寸与字号使用两个代表值，常用语法可在对应端查到', async () => {
	const theme = postcss.parse(
		await readFile(new URL('../node_modules/tailwindcss/theme.css', import.meta.url), 'utf8')
	)
	const colors = new Map()
	theme.walkDecls(/^--color-/, (decl) => colors.set(decl.prop.slice(8), decl.value))
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		const demos = await readCatalog(platform)
		for (const [property, prefix] of [
			['color', 'text'],
			['background-color', 'bg'],
			['border-color', 'border']
		]) {
			const samples = new Map(
				demos
					.find((demo) => demo.property === property)
					.cases.map((sample) => [sample.className, sample])
			)
			assert.deepEqual(
				[...samples.keys()].filter((name) => colors.has(name.slice(prefix.length + 1))),
				[`${prefix}-red-500`, `${prefix}-blue-500`],
				`${platform}: ${property} 只需用两个代表色演示命名颜色`
			)
			for (const name of ['red-500', 'blue-500'])
				assert.equal(
					samples.get(`${prefix}-${name}`)?.value,
					colors.get(name),
					`${platform}: ${prefix}-${name} 与当前版本的主题色值不一致`
				)
			assert.ok(samples.has(`${prefix}-red-500/50`), platform)
			assert.ok(samples.has(`${prefix}-red-500!`), platform)
		}
		for (const [property, prefix] of [
			['width', 'w'],
			['min-width', 'min-w'],
			['max-width', 'max-w']
		]) {
			const samples = demos
				.find((demo) => demo.property === property)
				.cases.filter((sample) =>
					/^(?:min-w|max-w|w)-(?:[23]xs|xs|sm|md|lg|xl|[2-7]xl)$/.test(sample.className)
				)
			assert.deepEqual(
				samples.map((sample) => [sample.className, sample.value]),
				[
					[`${prefix}-3xs`, '160px'],
					[`${prefix}-2xs`, '200px']
				],
				`${platform}: ${property} 只需用两个适合预览的命名尺寸`
			)
		}
		assert.deepEqual(
			demos
				.find((demo) => demo.property === 'font-size')
				.cases.filter((sample) =>
					/^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/.test(sample.className)
				)
				.map((sample) => sample.className),
			['text-sm', 'text-lg']
		)
		const names = new Set(demos.flatMap((demo) => demo.cases.map((sample) => sample.className)))
		for (const name of [
			'shadow-2xs',
			'shadow-xs',
			'size-64',
			'size-1/2',
			'py-8 px-24',
			'my-8 mx-24',
			'rounded-xs',
			'rounded-4xl',
			'rounded-t-lg',
			'text-sm',
			'text-lg',
			'text-base/24',
			'text-base/(--demo-leading)',
			'font-sans',
			'transform-(--demo-transform)',
			'backdrop-blur-sm'
		])
			assert.ok(names.has(name), `${platform}: ${name}`)
		assert.equal(names.has('shadow-lg'), platform !== 'app-harmony', platform)
		for (const name of [
			'shadow-lg/50',
			'inset-shadow-sm',
			'ring-2 ring-blue-500',
			'tracking-wide',
			'min-w-full',
			'md:text-red-500'
		])
			assert.equal(names.has(name), platform === 'web', `${platform}: ${name}`)
	}
})

test('动画变量示例在 App 展开静态主题，其他端保留引用，并使用全局关键帧', async (t) => {
	const previous = process.env.UNI_PLATFORM
	t.after(() => {
		if (previous == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previous
	})
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		const animation = (await readCatalog(platform)).find(
			(demo) => demo.property === 'animation'
		)
		const sample = animation.cases.find((sample) => sample.className.startsWith('animate-('))
		assert.ok(sample, platform)
		process.env.UNI_PLATFORM = platform
		const plugins = uniAppXTailwind({ entry: fixture + 'tailwind.css', utsRenameRetry: false })
		const app = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
		const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
		const compiled = await app.transform(
			"@import './tailwind.css';",
			fixture + 'App.uvue?vue&type=style&index=0&lang.css'
		)
		const root = postcss.parse(compiled.code)
		let animationValue
		root.walkDecls(sample.value.slice(4, -1), (decl) => {
			animationValue = decl.value
		})
		assert.equal(animationValue, 'demo-slide 2s ease-in-out infinite alternate')
		const globalFrames = new Map()
		root.walkAtRules('keyframes', (frame) => globalFrames.set(frame.params, frame))
		const frames = globalFrames.get('demo-slide')
		assert.ok(frames, '变量中的自定义动画名必须有对应的全局关键帧')
		assert.deepEqual(
			frames.nodes.map((frame) => [frame.selector, frame.first.prop, frame.first.value]),
			[
				['from', 'transform', 'translateX(0px)'],
				['to', 'transform', 'translateX(120px)']
			]
		)
		const file = fixture + 'pages/css/property.uvue'
		const source = await readFile(file, 'utf8')
		// 页面关键帧会被 Vue 改名，变量不能依赖这些局部定义。
		postcss
			.parse(source.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1])
			.walkAtRules('keyframes', (frame) => {
				assert.notEqual(frame.params, 'demo-slide')
			})
		const local = await classes.transform(source, file)
		let value
		for (const style of local.code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
			postcss.parse(style[1]).walkRules('.' + toSafeClassName(sample.className), (rule) => {
				value = rule.nodes.find((node) => node.prop === 'animation')?.value
			})
		assert.equal(value, platform.startsWith('app-') ? animationValue : sample.value, platform)
	}
})

test('示例可按工具类搜索，搜索后重置展示数量并能找到后面的写法', async () => {
	const demos = await readCatalog('web')
	const watches = new Map()
	const context = {
		cssDemos: demos,
		computed: (callback) => ({
			get value() {
				return callback()
			}
		}),
		ref: (initial) => {
			let value = initial
			const state = {
				get value() {
					return value
				},
				set value(next) {
					value = next
					watches.get(state)?.()
				}
			}
			return state
		},
		watch: (state, callback) => watches.set(state, callback),
		onLoad() {},
		uni: {}
	}
	const run = async (file, state) => {
		const source = await readFile(fixture + file, 'utf8')
		const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
		return runInNewContext(
			stripTypeScriptTypes(script.replace(/^import .*$/gm, '') + '\n;(' + state + ')'),
			context
		)
	}
	const home = await run('pages/index.uvue', '{query, groups}')
	home.query.value = ' TEXT-RED-500 '
	assert.deepEqual(
		Array.from(home.groups.value.flatMap((group) => group.items.map((demo) => demo.property))),
		['color']
	)
	home.query.value = 'shadow-lg'
	assert.equal(home.groups.value[0].items[0].property, 'box-shadow')
	const detail = await run(
		'pages/css/property.uvue',
		'{demo, caseQuery, visibleCount, filteredCases, visibleCases}'
	)
	detail.demo.value = demos.find((demo) => demo.property === 'color')
	assert.equal(detail.visibleCases.value.length, 12)
	detail.visibleCount.value += 12
	assert.equal(detail.visibleCases.value.length, detail.demo.value.cases.length)
	detail.caseQuery.value = ' TEXT-(--ACCENT) '
	assert.equal(detail.visibleCount.value, 12)
	assert.equal(detail.visibleCases.value.length, 1)
	assert.equal(detail.visibleCases.value[0].className, 'text-(--accent)')
	detail.caseQuery.value = '没有这个写法'
	assert.equal(detail.filteredCases.value.length, 0)
	detail.caseQuery.value = ''
	assert.equal(detail.visibleCases.value.length, 12)
})

test('六端均可通过官方说明入口导航，并且只加载对应属性的 DCloud 文档', async () => {
	const pagesFile = fixture + 'pages.json'
	const propertyFile = fixture + 'pages/css/property.uvue'
	const webviewFile = fixture + 'pages/webview.uvue'
	const [pagesSource, propertySource, webviewSource] = await Promise.all([
		readFile(pagesFile, 'utf8'),
		readFile(propertyFile, 'utf8'),
		readFile(webviewFile, 'utf8')
	])
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		const context = createConditionContext(platform)
		// 原生端移除 Web 配置后仍有尾逗号，按 pages.json 的 JSONC 规则读取。
		const routes = JSON.parse(
			filterConditions(pagesSource, context, pagesFile).replace(/,\s*([}\]])/g, '$1')
		).pages
		const route = routes.find((page) => page.path === 'pages/webview')
		const property = filterConditions(propertySource, context, propertyFile)
		const link = property.match(/:url="([^"]+)"\s+class="official-link"/)
		assert.equal(route?.style.navigationStyle, 'default', platform)
		assert.ok(link, platform)
		assert.match(property, /查看 DCloud 官方说明/)
		assert.match(webviewSource, /<web-view\b[\s\S]*?:src="url"/)
		const script = webviewSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
		let load
		const titles = []
		const notices = []
		const url = runInNewContext(
			stripTypeScriptTypes(script.replace(/^import .*$/gm, '') + '\nurl'),
			{
				ref: (value) => ({ value }),
				cssDemos: await readCatalog(platform),
				onLoad: (callback) => (load = callback),
				uni: {
					setNavigationBarTitle: ({ title }) => titles.push(title),
					showToast: ({ title }) => notices.push(title)
				}
			}
		)
		for (const name of ['https://example.com', '../index']) {
			load({ name })
			assert.equal(url.value, '', platform)
		}
		assert.equal(notices.length, 2)
		for (const name of ['align-content', 'animation-fill-mode']) {
			const destination = runInNewContext(link[1], { demo: { property: name } })
			const target = new URL(destination, 'https://demo.example')
			assert.equal(target.pathname, '/' + route.path)
			load({ name: target.searchParams.get('name') })
			assert.equal(url.value, `https://doc.dcloud.net.cn/uni-app-x/css/${name}.html`)
			assert.ok(titles.at(-1).includes(name))
		}
	}
})

test('官方 CSS 目录中的 110 项属性均可导航，示例 class 在六端生成对应声明', async (t) => {
	const previous = process.env.UNI_PLATFORM
	t.after(() => {
		if (previous == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previous
	})
	const pagesFile = fixture + 'pages.json'
	// pages.json 保留 uni-app 条件注释，按 Web 分支预处理后核对公共路由。
	const routes = JSON.parse(
		filterConditions(
			await readFile(pagesFile, 'utf8'),
			createConditionContext('web'),
			pagesFile
		)
	).pages
	assert.ok(routes.some((page) => page.path === 'pages/css/property'))
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		process.env.UNI_PLATFORM = platform
		const demos = await readCatalog(platform)
		assert.equal(demos.length, 110)
		assert.equal(new Set(demos.map((demo) => demo.property)).size, 110)
		if (platform === 'web') assert.ok(demos.flatMap((demo) => demo.cases).length >= 350)
		const plugins = uniAppXTailwind({ entry: fixture + 'tailwind.css', utsRenameRetry: false })
		const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
		const file = fixture + 'pages/css/property.uvue'
		const result = await classes.transform(await readFile(file, 'utf8'), file)
		const rules = new Map()
		for (const style of result.code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
			postcss.parse(style[1]).walkRules((rule) => {
				for (const selector of rule.selectors) rules.set(selector, rule)
			})
		}
		// 从页面读取实际基础类，检查生成的声明不覆盖当前属性，也不引入其他方向的边框。
		const borderClasses = result.code.match(/const borderPreviewClasses[^=]*=[\s\S]*?\n}/)
		assert.ok(borderClasses)
		const { borderPreviewClasses } = await import(
			'data:text/javascript;base64,' +
				Buffer.from(stripTypeScriptTypes('export ' + borderClasses[0])).toString('base64')
		)
		for (const demo of demos) {
			assert.equal(
				new Set(demo.cases.map((sample) => sample.className)).size,
				demo.cases.length,
				`${platform}: ${demo.property} 包含重复写法`
			)
			if (demo.kind.startsWith('border')) {
				const baseProperties = new Set()
				for (const name of (borderPreviewClasses[demo.property] ?? '').split(/\s+/)) {
					if (name.length === 0) continue
					const rule = rules.get('.' + toSafeClassName(name))
					assert.ok(rule, `${platform}: ${demo.property} 的基础类 ${name} 没有生成 CSS`)
					rule.walkDecls((decl) => {
						if (decl.prop.startsWith('border')) baseProperties.add(decl.prop)
					})
				}
				const prefix = demo.property.replace(/-(color|style|width)$/, '')
				// 宽度工具类自带样式声明，基础类只补颜色，不能重复覆盖工具类的默认样式。
				const expected = {
					'border': [],
					'border-width': ['color'],
					'border-color': ['width', 'style'],
					'border-style': ['width', 'color']
				}[demo.kind].map((suffix) => `${prefix}-${suffix}`)
				assert.deepEqual(
					[...baseProperties].sort(),
					expected.sort(),
					`${platform}: ${demo.property}`
				)
			}
			const cssProperty = demo.property === 'lines' ? '-webkit-line-clamp' : demo.property
			for (const sample of demo.cases) {
				const declarations = []
				for (const name of sample.className.split(/\s+/)) {
					const selector = '.' + toSafeClassName(name)
					const rule = rules.get(selector)
					assert.ok(rule, `${platform}: ${demo.property} 的 ${name} 没有生成 CSS`)
					rule.walkDecls((decl) => declarations.push(decl))
				}
				// 任意属性语法只输出指定属性；普通、变量及任意长度工具类应保留默认样式。
				if (demo.kind === 'border-width' && !sample.className.startsWith('[')) {
					const styleProperty = demo.property.replace(/-width$/, '-style')
					assert.equal(
						declarations.find((decl) => decl.prop === styleProperty)?.value,
						platform === 'web'
							? 'var(--tw-border-style)'
							: 'var(--tw-border-style, solid)',
						`${platform}: ${sample.className} 的 ${styleProperty} 默认样式不正确`
					)
				}
				const expected = sample.css
					? postcss.parse(sample.css).nodes.map((decl) => decl.prop)
					: [cssProperty]
				const logicalProperties = {
					'margin-inline': ['margin-left', 'margin-right'],
					'margin-block': ['margin-top', 'margin-bottom'],
					'padding-inline': ['padding-left', 'padding-right'],
					'padding-block': ['padding-top', 'padding-bottom']
				}
				for (const property of expected.flatMap((name) =>
					platform === 'web' ? [name] : (logicalProperties[name] ?? [name])
				))
					assert.ok(
						declarations.some((decl) => decl.prop === property),
						`${platform}: ${sample.className} 没有生成 ${property}`
					)
			}
		}
	}
})

test('插件完整转换保留条件指令原文，包括开头换行和表达式内部换行', async (t) => {
	const previous = process.env.UNI_PLATFORM
	t.after(() => {
		if (previous == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previous
	})
	process.env.UNI_PLATFORM = 'app-android'
	const plugins = uniAppXTailwind({ entry: fixture + 'tailwind.css', utsRenameRetry: false })
	const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
	for (const newline of ['\n', '\r\n']) {
		for (const expression of [
			"['paint', 'border'].includes(demo.kind)",
			`${newline} ['paint', 'border'].includes(demo.kind)${newline}`,
			`demo.kind ===${newline} 'paint'`,
			`${newline} true${newline}`
		]) {
			const first = `v-if="${expression}"`
			const second = `v-else-if="${expression}"`
			const source = `<template><view ${first} class="w-[13px]" /><view ${second} class="w-[13px]" /></template>`
			const result = await classes.transform(source, fixture + 'pages/css/property.uvue')
			assert.ok(result.code.includes(first), first)
			assert.ok(result.code.includes(second), second)
			// 确认经过了真实类名转换，避免未命中插件时的原文检查假通过。
			assert.match(result.code, /class="w-13px"/)
		}
	}
})

test('App 预览条件由配套 SDK 保留为响应式分支，不会编译为恒假', async (t) => {
	const compilerPath = process.env.UNIAPPX_TEST_VAPOR_COMPILER
	if (!compilerPath) {
		t.skip('设置 UNIAPPX_TEST_VAPOR_COMPILER 和 NODE_PATH 为 HV 或 HX 对应的配套 SDK 路径')
		return
	}
	const previous = new Map(
		['UNI_PLATFORM', 'UNI_APP_X', 'UNI_APP_X_DOM2'].map((name) => [name, process.env[name]])
	)
	t.after(() => {
		for (const [name, value] of previous) {
			if (value == null) delete process.env[name]
			else process.env[name] = value
		}
	})
	Object.assign(process.env, {
		UNI_PLATFORM: 'app-android',
		UNI_APP_X: 'true',
		UNI_APP_X_DOM2: 'true'
	})
	const sdkRequire = createRequire(compilerPath)
	// 与 SDK CLI 一样初始化别名和原生标签规则，避免把 button 等框架组件误作原生节点。
	sdkRequire('@dcloudio/uni-cli-shared/dist/alias')
	const compiler = sdkRequire(compilerPath)
	const { isDom2AppNativeTag } = sdkRequire('@dcloudio/uni-shared')
	const file = fixture + 'pages/css/property.uvue'
	const plugins = uniAppXTailwind({ entry: fixture + 'tailwind.css', utsRenameRetry: false })
	const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
	const transformed = await classes.transform(await readFile(file, 'utf8'), file)
	const template = filterConditions(
		transformed.code.match(/<template>([\s\S]*?)<\/template>/)[1],
		createConditionContext('app-android'),
		file
	)
	const warnings = []
	const result = compiler.compile(template, {
		platform: 'app-android',
		componentType: 'page',
		filename: file,
		relativeFilename: 'pages/css/property.uvue',
		className: 'PreviewRegression',
		prefixIdentifiers: true,
		inline: true,
		bindingMetadata: {
			demo: 'setup-ref',
			isFlexPreview: 'setup-ref',
			isPaintPreview: 'setup-ref'
		},
		r: (helper) => helper,
		isNativeTag: isDom2AppNativeTag,
		isUserComponent: (node) => !isDom2AppNativeTag(node.tag),
		emitSharedData() {},
		onError(error) {
			throw error
		},
		onWarn: (warning) => warnings.push(warning.message)
	})
	assert.deepEqual(warnings, [])
	assert.match(result.code, /toSharedDataBoolean\(isFlexPreview\.value\)/)
	assert.match(result.code, /toSharedDataBoolean\(isPaintPreview\.value\)/)
	assert.doesNotMatch(result.code, /createSharedDataIf\(\(\) => false/)
})

test('演示页面的 App CSS 可由 HV 或 HX 配套 SDK 编译', async (t) => {
	const compilerPath = process.env.UNIAPPX_TEST_VAPOR_COMPILER
	if (!compilerPath) {
		t.skip('设置 UNIAPPX_TEST_VAPOR_COMPILER 和 NODE_PATH 为 HV 或 HX 对应的配套 SDK 路径')
		return
	}
	const compiler = createRequire(import.meta.url)(compilerPath)
	const previous = process.env.UNI_PLATFORM
	t.after(() => {
		if (previous == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previous
	})
	for (const platform of ['app-android', 'app-ios', 'app-harmony']) {
		process.env.UNI_PLATFORM = platform
		const plugins = uniAppXTailwind({ entry: fixture + 'tailwind.css', utsRenameRetry: false })
		const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
		const apply = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-apply-fallback')
		for (const page of ['pages/index.uvue', 'pages/css/property.uvue']) {
			const file = fixture + page
			const result = await classes.transform(await readFile(file, 'utf8'), file)
			for (const style of result.code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
				const applied = await apply.transform(
					filterConditions(style[1], createConditionContext(platform), file + '.css'),
					file + '?vue&type=style&index=0&lang.css'
				)
				const parsed = await compiler.parseCss(applied?.code ?? style[1], {
					platform,
					output: 'bin',
					emitDebugJson: true
				})
				assert.deepEqual(
					parsed.messages.map((message) => message.text),
					[],
					`${platform}: ${page}`
				)
				if (page !== 'pages/css/property.uvue') continue
				// 变量简写即使编译无报错也可能无法播放，必须核对原生长属性的具体值。
				const animation = parsed.decoded.sections
					.flatMap((section) => section.rules)
					.find(
						(rule) =>
							rule.kindName === 'StyleRule' &&
							rule.name === toSafeClassName('animate-(--animate-demo)')
					)
				assert.ok(animation, platform)
				const animationValues = Object.fromEntries(
					animation.declarations.map((node) => [node.propertyName, node.value])
				)
				for (const [name, value] of Object.entries({
					'animation-name': 'demo-slide',
					'animation-duration': '2s',
					'animation-timing-function': 'ease-in-out',
					'animation-direction': 'alternate',
					'animation-iteration-count': 'infinite',
					'animation-play-state': 'running'
				}))
					assert.equal(animationValues[name], value, `${platform}: ${name}`)
				// 编译成功之外，核对长度、边框默认样式和颜色的原生声明，避免变量或静默丢弃掩盖问题。
				const root = postcss.parse(applied?.code ?? style[1])
				for (const [name, property, value, nativeId] of [
					['text-sm', 'font-size', '14px', 'FontSize'],
					['text-lg', 'font-size', '18px', 'FontSize'],
					['rounded-lg', 'border-radius', '8px', 'BorderTopLeftRadius'],
					['w-3xs', 'width', '160px', 'Width'],
					['w-2xs', 'width', '200px', 'Width'],
					['font-sans', 'font-family', 'sans-serif', 'FontFamily'],
					['shadow-2xs', 'box-shadow', '0 1px rgba(0,0,0,0.05)', 'BoxShadow'],
					...[
						['t', 'top', 'Top'],
						['r', 'right', 'Right'],
						['b', 'bottom', 'Bottom'],
						['l', 'left', 'Left']
					].flatMap(([prefix, side, nativeSide]) => [
						[
							`border-${prefix}-4`,
							`border-${side}-width`,
							'4px',
							`Border${nativeSide}Width`
						],
						[
							`border-${prefix}-4`,
							`border-${side}-style`,
							'var(--tw-border-style, solid)',
							`Border${nativeSide}Style`
						],
						[
							`[border-${side}-style:solid]`,
							`border-${side}-style`,
							'solid',
							`Border${nativeSide}Style`
						],
						[
							`border-${prefix}-red-500`,
							`border-${side}-color`,
							'var(--color-red-500)',
							`Border${nativeSide}Color`
						],
						[
							`border-${prefix}-blue-500/50`,
							`border-${side}-color`,
							'rgba(43,127,255,0.5)',
							`Border${nativeSide}Color`
						]
					])
				]) {
					let rule
					root.walkRules('.' + toSafeClassName(name), (node) => {
						rule = node
					})
					assert.ok(rule, `${platform}: ${name}`)
					assert.equal(
						rule.nodes.find((node) => node.type === 'decl' && node.prop === property)
							?.value,
						value
					)
					const native = await compiler.parseCss(rule.toString(), {
						platform,
						output: 'code'
					})
					assert.ok(
						native.code.includes('UniCSSPropertyID::' + nativeId),
						`${platform}: ${name} 未保留原生声明`
					)
				}
			}
		}
	}
})
