import assert from 'node:assert/strict'
import fsPromises from 'node:fs/promises'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { uniAppXTailwind } from '../src/index.mjs'
import { toSafeClassName } from '../src/class-name.mjs'

const safeClasses = (value) =>
	value
		.split(' ')
		.map((name) => toSafeClassName(name))
		.join(' ')

const hostFile = (file) => fileURLToPath(new URL(`./fixtures/host/${file}`, import.meta.url))
const temporaryParent = tmpdir()
const require = createRequire(import.meta.url)

test('App 入口与 @apply 保留变量计算，只折叠已落到具体属性的 inline 值', async (t) => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-variable-calc-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const previousPlatform = process.env.UNI_PLATFORM
	t.after(() => {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
	})
	process.env.UNI_PLATFORM = 'app-android'
	const entry = join(directory, 'tailwind.css')
	await writeFile(
		entry,
		`@import ${JSON.stringify(require.resolve('tailwindcss/index.css').replace(/\\/g, '/'))} source(none);
@theme inline { --spacing: 2px; }
@utility variable-width { --size: calc(1px - 2px); width: var(--size); }
@source inline("variable-width p-4");`
	)
	const plugins = uniAppXTailwind({ entry })
	const app = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
	const apply = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-apply-fallback')
	const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
	for (const output of [
		await app.transform("@import './tailwind.css';", id),
		await apply.transform('.applied { @apply variable-width p-4; }', id)
	]) {
		assert.match(output.code, /--size:\s*calc\(1px - 2px\)/)
		assert.match(output.code, /width:\s*var\(--size\)/)
		assert.match(output.code, /padding:\s*8px/)
	}
})

test('四种 Tailwind 动画在 App 内联静态主题并修正单位变换，Web 保留原值', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-animation-'))
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		const entry = join(directory, 'tailwind.css')
		const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
		const names = ['bounce', 'ping', 'pulse', 'spin']
		await writeFile(entry, `@import "${tailwind}" source(none); @source './page.uvue';`)
		await writeFile(
			join(directory, 'page.uvue'),
			`<template>${names.map((name) => `<view class="animate-${name}" />`).join('')}</template>`
		)
		for (const platform of [
			'web',
			'mp-weixin',
			'app',
			'app-android',
			'app-ios',
			'app-harmony'
		]) {
			process.env.UNI_PLATFORM = platform
			const plugins = uniAppXTailwind({
				entry,
				componentLocalStyles: false,
				include: [/type=style/]
			})
			const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
			const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
			const compat = plugins.find((item) => item.name === 'uniappx-tailwind-vapor-compat')
			const id = join(directory, 'App.uvue') + '?vue&type=style&scoped=abc123&lang.css'
			const compiled = await app.transform("@import './tailwind.css';", id)
			const applied = await apply.transform(
				names.map((name) => `.applied-${name} { @apply animate-${name}; }`).join('\n') +
					'\n.arbitrary { @apply animate-bounce w-[13px]; }',
				id
			)
			for (const result of [compiled, applied]) {
				const root = postcss.parse(result.code)
				const frames = new Map()
				root.walkAtRules('keyframes', (node) => {
					frames.set(
						node.params,
						node.nodes.map((frame) => frame.toString())
					)
					// Vue scoped 编译会改写关键帧名称，但不会改写 var() 内的动画名称。
					if (platform === 'web') node.params += '-abc123'
				})
				assert.deepEqual([...frames.keys()].sort(), [...names].sort())
				const module = `const __vite__css = ${JSON.stringify(root.toString())}`
				const output = compat.transform(module, id).code
				const final = postcss.parse(JSON.parse(output.slice(output.indexOf('=') + 1)))
				final.walkAtRules('keyframes', (node) => {
					assert.deepEqual(
						node.nodes.map((frame) => frame.toString()),
						frames.get(node.params)
					)
				})
				for (const name of names) {
					const selector = result === compiled ? `.animate-${name}` : `.applied-${name}`
					const rule = final.nodes.find((node) => node.selector === selector)
					assert.ok(
						rule.nodes.some(
							(node) =>
								node.prop === 'animation' &&
								(platform.startsWith('app')
									? node.value.startsWith(`${name} `)
									: node.value.includes(`var(--animate-${name}`))
						),
						`${platform}: ${selector}: ${rule.toString()}`
					)
					assert.match(compiled.code, new RegExp(`--animate-${name}:\\s*${name} `))
				}
				assert.match(final.toString(), /transform:\s*translateY\(-25%\)/)
				assert.match(
					final.toString(),
					platform.startsWith('app')
						? /transform:\s*translateY\(0\)/
						: /transform:\s*none/
				)
				assert.match(final.toString(), /transform:\s*scale\(2\)/)
				assert.match(final.toString(), /opacity:\s*0\.5/)
				assert.match(final.toString(), /transform:\s*rotate\(360deg\)/)
			}
		}
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
		await rm(directory, { recursive: true, force: true })
	}
})

test('动态主题与 fallback 不冻结，Web 变量覆盖和手写同名关键帧保持隔离', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-animation-native-'))
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		const entry = join(directory, 'tailwind.css')
		const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
		await writeFile(
			entry,
			`@import "${tailwind}" source(none);
@theme {
	--animate-bounce: bounce 2s linear infinite;
	--animate-live: bounce var(--duration, 3s) infinite;
	--animate-alias: var(--runtime-animation, bounce 4s infinite);
}
@source inline("animate-bounce animate-live animate-alias animate-(--runtime-animation)");
.manual { animation: var(--animate-bounce); }
.override { --animate-bounce: bounce 7s infinite; }
@keyframes manual { to { opacity: 0.4; transform: none; } }
@keyframes bounce { to { transform: none; } }
.manual-name { animation: manual 2s; }`
		)
		for (const platform of ['web', 'app-android']) {
			process.env.UNI_PLATFORM = platform
			const plugins = uniAppXTailwind({ entry })
			const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
			const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
			const id = join(directory, 'App.uvue') + '?vue&type=style&lang.css'
			const compiled = await app.transform("@import './tailwind.css';", id)
			const applied = await apply.transform(
				`.applied { @apply animate-bounce; animation: var(--animate-bounce); }
.live { @apply animate-live; }
.alias { @apply animate-alias; }
.runtime { @apply animate-(--runtime-animation); }
.fallback { @apply animate-[var(--runtime-animation,bounce_5s_infinite)]; }
@keyframes bounce { to { transform: none; } }`,
				id
			)
			for (const result of [compiled, applied]) {
				assert.match(result.code, /animation:\s*var\(--animate-bounce\)/)
				assert.match(result.code, /animation:\s*var\(--animate-live[,)]/)
				assert.match(result.code, /animation:\s*var\(--animate-alias[,)]/)
				assert.match(result.code, /animation:\s*var\(--runtime-animation\)/)
				if (platform === 'app-android')
					assert.match(result.code, /animation:\s*bounce 2s linear infinite/)
				else assert.doesNotMatch(result.code, /animation:\s*bounce 2s/)
				assert.match(result.code, /@keyframes bounce\s*\{\s*to\s*\{\s*transform: none;/)
			}
			assert.match(compiled.code, /--animate-bounce:\s*bounce 7s infinite/)
			assert.match(compiled.code, /@keyframes manual/)
			assert.match(compiled.code, /animation:\s*manual 2s/)
			assert.match(applied.code, /var\(--runtime-animation,\s*bounce 5s infinite\)/)
		}
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
		await rm(directory, { recursive: true, force: true })
	}
})

test('按样式模块收集 Tailwind 动画，入口和 @apply 的手写关键帧保持 scoped 隔离', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-animation-scope-'))
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		process.env.UNI_PLATFORM = 'web'
		const entry = join(directory, 'tailwind.css')
		const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
		await writeFile(
			entry,
			`@import "${tailwind}" source(none);
@theme {
	--animate-sway: sway-motion 2s infinite;
	@keyframes sway-motion { to { transform: translateX(12px); } }
	--animate-glow: glow-motion 3s infinite;
	@keyframes glow-motion { to { opacity: 0.3; } }
}
@source inline("animate-sway");
@keyframes entry-manual { to { opacity: 0.4; } }
.entry-manual { animation: entry-manual 2s; }`
		)
		const plugins = uniAppXTailwind({ entry, include: [/type=style/] })
		const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
		const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
		const compat = plugins.find((item) => item.name === 'uniappx-tailwind-vapor-compat')
		const appId = join(directory, 'App.uvue') + '?vue&type=style&index=0&scoped=abc123&lang.css'
		const pageId =
			join(directory, 'Page.uvue') + '?vue&type=style&index=0&scoped=def456&lang.css'
		const manual = '@keyframes local { to { opacity: 0.5; } } .local { animation: local 1s; }'
		const finish = (code, id) => {
			const scopeId = new URLSearchParams(id.split('?')[1]).get('scoped')
			const root = postcss.parse(code)
			const names = new Set()
			root.walkAtRules('keyframes', (node) => {
				names.add(node.params)
				node.params += `-${scopeId}`
			})
			root.walkDecls(/^(?:animation|animation-name)$/, (node) => {
				if (names.has(node.value.split(' ')[0]))
					node.value = node.value.replace(/^\S+/, (name) => `${name}-${scopeId}`)
			})
			return compat.transform(root.toString(), id).code
		}
		const source = `@import './tailwind.css'; ${manual}`
		const compiled = await app.transform(source, appId)
		const output = finish(compiled.code, appId)
		assert.match(output, /@keyframes sway-motion\s*\{/)
		assert.match(output, /animation:\s*var\(--animate-sway\)/)
		assert.match(output, /@keyframes entry-manual-abc123/)
		assert.match(output, /animation:\s*entry-manual-abc123 2s/)
		assert.match(output, /@keyframes local-abc123/)
		assert.match(output, /animation:\s*local-abc123 1s/)
		assert.equal(finish((await app.transform(source, appId)).code, appId), output)

		// 同一 App 样式块的 @apply 收集不能覆盖入口集合。
		const combined = await apply.transform(
			compiled.code + '.glow { @apply animate-glow; }',
			appId
		)
		const combinedOutput = finish(combined.code, appId)
		assert.match(combinedOutput, /@keyframes sway-motion\s*\{/)
		assert.match(combinedOutput, /@keyframes glow-motion\s*\{/)
		assert.match(combinedOutput, /@keyframes local-abc123/)

		const pageSource = `${manual} .glow { @apply animate-glow w-[13px]; }
@keyframes sway-motion { to { opacity: 0.6; } }
.handwritten { animation-name: sway-motion; }`
		const applied = await apply.transform(pageSource, pageId)
		// inline/timestamp 等传输参数变化不能丢失该样式块的来源记录。
		const pageOutput = finish(applied.code, pageId + '&inline&t=123')
		assert.match(pageOutput, /@keyframes glow-motion\s*\{/)
		assert.match(pageOutput, /animation:\s*var\(--animate-glow/)
		assert.match(pageOutput, /@keyframes local-def456/)
		assert.match(pageOutput, /animation:\s*local-def456 1s/)
		assert.match(pageOutput, /@keyframes sway-motion-def456/)
		assert.match(pageOutput, /animation-name:\s*sway-motion-def456/)

		const handwritten =
			'@keyframes glow-motion { to { opacity: 0.7; } } .x { animation: glow-motion 1s; }'
		assert.match(
			finish(handwritten, pageId.replace('index=0', 'index=1')),
			/@keyframes glow-motion-def456/
		)
		const changed = await apply.transform(handwritten + '.x { @apply animate-sway; }', pageId)
		assert.match(finish(changed.code, pageId), /@keyframes glow-motion-def456/)
		assert.match(finish(changed.code, pageId), /@keyframes sway-motion\s*\{/)
		const removed = '@keyframes sway-motion { to { opacity: 0.8; } }'
		assert.equal(await apply.transform(removed, pageId), null)
		assert.match(finish(removed, pageId), /@keyframes sway-motion-def456/)
		assert.equal(await app.transform(removed, appId), null)
		assert.match(finish(removed, appId), /@keyframes sway-motion-abc123/)
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
		await rm(directory, { recursive: true, force: true })
	}
})

test('入口和 @apply 仅折叠 Tailwind 来源，手写 CSS 经后置钩子保持计算原值', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-calc-source-'))
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		const entry = join(directory, 'tailwind.css')
		const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
		await writeFile(
			entry,
			`@import "${tailwind}" source(none);
@theme inline { --spacing: 2px; }
@source inline("p-4 w-[calc(2px+3px)] rounded-full");
@utility measured { height: calc(3px * 4); }
@source inline("measured");
@import './manual.css';
.mixed { width: calc(2px + 3px); @apply p-4; }
.p-4 { margin: calc(2px * 4); }
.override { --spacing: 20px; }`
		)
		await writeFile(join(directory, 'manual.css'), '.imported { width: calc(3px * 4); }')
		for (const platform of ['web', 'app-android', 'app-ios', 'app-harmony']) {
			process.env.UNI_PLATFORM = platform
			const plugins = uniAppXTailwind({ entry, include: [/type=style/] })
			const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
			const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
			const compat = plugins.find((item) => item.name === 'uniappx-tailwind-vapor-compat')
			const id = join(directory, 'App.uvue') + '?vue&type=style&lang.css'
			const compiled = await app.transform("@import './tailwind.css';", id)
			const output = compat.transform(compiled.code, id).code
			assert.match(output, /width:\s*calc\(2px \+ 3px\)/)
			assert.match(output, /margin:\s*calc\(2px \* 4\)/)
			assert.match(output, /width:\s*calc\(3px \* 4\)/)
			assert.match(
				output,
				platform === 'web' ? /padding:\s*calc\(2px \* 4\)/ : /padding:\s*8px/
			)
			assert.match(
				output,
				platform === 'web' ? /height:\s*calc\(3px \* 4\)/ : /height:\s*12px/
			)
			assert.match(
				output,
				platform === 'web'
					? /border-radius:\s*calc\(infinity \* 1px\)/
					: /border-radius:\s*9999px/
			)
			const applied = await apply.transform(
				'.mixed { width: calc(2px * 3); @apply p-4 h-[calc(3px*4)] rounded-[calc(100%/2)]; }',
				id
			)
			const final = compat.transform(applied.code, id).code
			assert.match(final, /width:\s*calc\(2px \* 3\)/)
			assert.match(
				final,
				platform === 'web' ? /padding:\s*calc\(2px \* 4\)/ : /padding:\s*8px/
			)
			assert.match(
				final,
				platform === 'web' ? /height:\s*calc\(3px \* 4\)/ : /height:\s*12px/
			)
			assert.match(final, /border-radius:\s*calc\(100% \/ 2\)/)
		}
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
		await rm(directory, { recursive: true, force: true })
	}
})

test('Tailwind 解析最终 inline 主题，普通主题、变量别名和 fallback 不固化', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-calc-theme-'))
	try {
		const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
		for (const [name, theme, expected] of [
			[
				'inline',
				'@theme inline { --spacing: 2px; } @theme inline { --spacing: 3px; }',
				/padding:\s*12px/
			],
			[
				'dynamic',
				'@theme { --spacing: 2px; }',
				/padding:\s*calc\(var\(--spacing(?:, 2px)?\) \* 4\)/
			],
			[
				'alias',
				'@theme inline { --spacing: var(--runtime, 2px); }',
				/padding:\s*calc\(var\(--runtime, 2px\) \* 4\)/
			]
		]) {
			const entry = join(directory, `${name}.css`)
			await writeFile(
				entry,
				`@import "${tailwind}" source(none); ${theme}
@source inline("p-4");
.local { --spacing: 20px; --runtime: 30px; }
@media (prefers-color-scheme: dark) { :root { --spacing: 40px; } }
:root { --spacing: 10px; }`
			)
			const plugins = uniAppXTailwind({ entry })
			const id = join(directory, 'App.uvue') + '?vue&type=style&lang.css'
			const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
			assert.match((await app.transform(`@import './${name}.css';`, id)).code, expected)
			const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
			assert.match((await apply.transform('.x { @apply p-4; }', id)).code, expected)
		}
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test('@apply 动画保留关键帧，官方支持的 align-content 和 backdrop-filter 可用', async () => {
	const entry = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ entry, utsRenameRetry: false })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
	const result = await plugin.transform(
		'.spin { @apply animate-spin content-start; } .blur { @apply backdrop-blur-[8px]; }',
		entry.replace('tailwind.css', 'App.uvue') + '?vue&type=style&index=0&lang.css'
	)
	assert.match(result.code, /animation:/)
	assert.match(result.code, /@keyframes spin/)
	assert.match(result.code, /transform:\s*rotate\(360deg\)/)
	assert.match(result.code, /align-content:\s*flex-start/)
	assert.match(result.code, /backdrop-filter:\s*blur\(8px\)/)
})

test('Web SCSS 通过 Sass 字面量保留 rounded-full 的 infinity 计算', async () => {
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		process.env.UNI_PLATFORM = 'web'
		const entry = hostFile('tailwind.css')
		const plugin = uniAppXTailwind({ entry, utsRenameRetry: false }).find(
			(item) => item.name === 'uniappx-tailwind-apply-fallback'
		)
		const result = await plugin.transform(
			'.pill { @apply rounded-full; } .manual { border-radius: calc(infinity * 1px); }',
			entry.replace('tailwind.css', 'App.uvue') + '?vue&type=style&index=0&lang.scss'
		)
		assert.ok(result.code.includes('#{"calc(infinity * 1px)"}'))
		assert.match(result.code, /\.manual \{ border-radius: calc\(infinity \* 1px\); \}/)
		assert.doesNotMatch(result.code, /9999px/)
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
	}
})

test('生产模式下所有平台保留四边定位和方向渐变', async () => {
	const previousPlatform = process.env.UNI_PLATFORM
	const previousMode = process.env.NODE_ENV
	const entry = hostFile('tailwind.css')
	try {
		process.env.NODE_ENV = 'production'
		for (const platform of ['app-android', 'app-ios', 'app-harmony', 'web', 'mp-weixin']) {
			process.env.UNI_PLATFORM = platform
			const plugins = uniAppXTailwind({ entry, utsRenameRetry: false })
			const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
			const result = await plugin.transform(
				'.panel { @apply absolute left-0 top-0 right-0 bottom-0; } .gradient { @apply bg-[linear-gradient(to_right,#667eea,#764ba2)]; }',
				entry.replace('tailwind.css', 'App.uvue') + '?vue&type=style&index=0&lang.css'
			)
			for (const side of ['top', 'right', 'bottom', 'left']) {
				assert.match(result.code, new RegExp(`${side}:\\s*0px`))
			}
			assert.doesNotMatch(result.code, /inset:/)
			assert.match(result.code, /linear-gradient\(to right,/)
		}
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
		if (previousMode == null) delete process.env.NODE_ENV
		else process.env.NODE_ENV = previousMode
	}
})

test('忽略入口及嵌套 CSS 文件中注释掉的导入', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-css-comments-'))
	try {
		const entry = join(directory, 'tailwind.css')
		await writeFile(
			entry,
			`/* @import './missing.css'; */
/*
@import './also-missing.css';
*/
@import './active.css';`
		)
		await writeFile(
			join(directory, 'active.css'),
			`/* @import './nested-missing.css'; */
.active { padding: 12px; }`
		)
		const plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-app-style'
		)
		const watched = []
		const result = await plugin.transform.call(
			{
				addWatchFile(file) {
					watched.push(file)
				}
			},
			"@import './tailwind.css';",
			join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
		)
		assert.match(result.code, /\.active\s*\{\s*padding:\s*12px/)
		assert.ok(watched.includes(join(directory, 'active.css')))
		assert.ok(watched.every((file) => !file.includes('missing.css')))
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test('规范化 uvue 模板中带 important 标记的类名', () => {
	const plugins = uniAppXTailwind()
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = '<template><view class="m-0! p-0!" /></template>'
	const result = plugin.transform(code, 'pages/index.uvue')

	assert.equal(result.code, '<template><view class="m-0-important p-0-important" /></template>')
})

test('无需 important 标记也能规范化变体类名', () => {
	const plugins = uniAppXTailwind()
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = '<template><text class="text-black dark:text-white" /></template>'
	const result = plugin.transform(code, 'pages/index.uvue')

	assert.equal(result.code, '<template><text class="text-black dark-text-white" /></template>')
})

test('将自定义属性颜色类名规范化为 Vapor 可用的名称', () => {
	const plugins = uniAppXTailwind()
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = '<template><text class="text-(--brand)" /></template>'
	const result = plugin.transform(code, 'pages/index.uvue')

	assert.ok(result.code.includes(`class="${toSafeClassName('text-(--brand)')}"`))
})

test('规范化计算类名引用中带 important 标记的类名', () => {
	const plugins = uniAppXTailwind()
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><text :class="emphasisClass" /></template><script setup>
const emphasisClass = computed(() => (isEmphasis.value ? 'text-error font-bold' : 'text-black!'))
const emphasisText = computed(() => (isEmphasis.value ? 'active' : 'text-black!'))
</script>`
	const result = plugin.transform(code, 'pages/index.uvue')

	assert.ok(result.code.includes(':class="__twClass(emphasisClass)"'))
	assert.ok(result.code.includes("'text-black!'"))
	assert.match(result.code, /'text-black!'/)
})

test('属性表达式中的比较符不截断标签及后续 class、hover-class 和 PT', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template>
<app-button v-if="undoButtonText.length > 0" :class="undoBtnClass" />
<app-button v-if='redoButtonText.length > 0' :class="redoBtnClass" />
<app-button v-if="clearButtonText.length > 0 && count < 2" :class="clearBtnClass" />
<view v-if="count > 0" class="p-0!" :hover-class="'bg-blue-500!'" :pt="{ root: 'm-0!' }" title="提示 > p-0!" />
<app-button v-if="count > 0" :pt="buttonPt" />
</template><script setup>
const undoBtnClass = computed(() => ['mr-10!', p.value.undoBtn ?? null])
const redoBtnClass = computed(() => ['mr-10!', p.value.redoBtn ?? null])
const clearBtnClass = computed(() => ['mr-10!', p.value.clearBtn ?? null])
const buttonPt = { root: 'px-[12px]' }
const message = 'mr-10!'
</script>`
	const result = plugin.transform(code, 'pages/signature.uvue')

	assert.ok(result)
	for (const name of ['undoBtnClass', 'redoBtnClass', 'clearBtnClass']) {
		assert.ok(result.code.includes(`const ${name} = computed(() => ['mr-10!',`))
		assert.ok(result.code.includes(`:class="__twClass(${name})"`))
	}
	assert.ok(result.code.includes('class="p-0-important"'))
	assert.ok(result.code.includes(`:hover-class="'bg-blue-500-important'"`))
	assert.ok(result.code.includes(`:pt="{ root: 'm-0-important' }"`))
	assert.ok(result.code.includes(`const buttonPt = { root: 'px-[12px]' }`))
	assert.ok(result.code.includes(':pt="__twPt(buttonPt)"'))
	assert.ok(result.code.includes('title="提示 > p-0!"'))
	assert.ok(result.code.includes(`const message = 'mr-10!'`))
})

test('规范化已配置对象中的所有静态类名值', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<app-search :pt="{ searchIcon: 'text-blue-600!', nested: { titleClass: 'text-[#fff]' } }" />`
	const result = plugin.transform(code, 'pages/search.uvue')

	assert.ok(result.code.includes(toSafeClassName('text-blue-600!')))
	assert.ok(result.code.includes(toSafeClassName('text-[#fff]')))
	assert.doesNotMatch(result.code, /text-blue-600!/)
})

test('默认不规范化 PT 字符串值', () => {
	const plugins = uniAppXTailwind()
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<app-search :pt="{ searchIcon: 'text-blue-600!' }" />`
	const result = plugin.transform(code, 'pages/search.uvue')

	assert.equal(result, null)
})

test('规范化 v-bind 配置中三元表达式两侧的 PT 对象，保留相邻业务文案', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><app-calendar v-bind="calendarOptions" /><app-radio :pt="{ root: 'flex-row' }" /></template>
<script setup lang="ts">
const calendarOptions = computed<CalendarProps>(() => ({
	confirmText: '确认 !',
	pt: enabled.value
		? { root: 'bg-red-600!', header: 'bg-[linear-gradient(to_right,#F5F9FF,#E8F0FF)]' }
		: { root: 'bg-red-600/30' },
	title: '提示 !'
}))
const message = { root: 'bg-red-600!' }
</script>`
	const result = plugin.transform(code, 'pages/calendar.uvue')
	assert.ok(result)
	assert.match(result.code, /v-bind="__twBindings\(calendarOptions,/)
	assert.match(result.code, /root: 'bg-red-600!'/)
	assert.match(result.code, /header: 'bg-\[linear-gradient\(to_right,#F5F9FF,#E8F0FF\)\]'/)
	assert.match(result.code, /root: 'bg-red-600\/30'/)
	assert.match(result.code, /confirmText: '确认 !'/)
	assert.match(result.code, /title: '提示 !'/)
	assert.match(result.code, /const message = \{ root: 'bg-red-600!' \}/)
})

test('规范化已配置的自定义类名属性', () => {
	const plugins = uniAppXTailwind({
		customAttributes: {
			'*': [/^[A-Za-z][A-Za-z0-9]*Class$/],
			'app-dialog': ['content-class']
		}
	})
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<app-dialog titleClass="text-[#fff]" :iconClass="active ? 'text-red-500!' : 'text-blue-600'" content-class="p-[12px]" />`
	const result = plugin.transform(code, 'pages/dialog.uvue')

	assert.ok(result.code.includes(`titleClass="${toSafeClassName('text-[#fff]')}"`))
	assert.ok(result.code.includes(toSafeClassName('text-red-500!')))
	assert.ok(result.code.includes(`content-class="${toSafeClassName('p-[12px]')}"`))
})

test('规范化正则匹配的自定义属性所引用的计算值', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': [/Class$/] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><view :buttonClass="buttonStyle" /></template><script setup>const buttonStyle = computed(() => active.value ? 'bg-blue-500!' : 'bg-gray-500!')</script>`
	const result = plugin.transform(code, 'pages/button.uvue')

	assert.ok(result.code.includes(':buttonClass="__twPt(buttonStyle)"'))
	assert.ok(result.code.includes("'bg-blue-500!'"))
	assert.ok(result.code.includes("'bg-gray-500!'"))
})

test('规范化已配置属性所引用的对象变量', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><app-dialog :pt="dialogPt" /></template><script setup>const dialogPt = { title: 'text-[#fff]', action: 'p-0!' }; const message = 'text-[#fff]'</script>`
	const result = plugin.transform(code, 'pages/dialog.uvue')

	assert.ok(result.code.includes(':pt="__twPt(dialogPt)"'))
	assert.ok(result.code.includes("title: 'text-[#fff]'"))
	assert.ok(result.code.includes("action: 'p-0!'"))
	assert.match(result.code, /message = 'text-\[#fff\]'/)
})

test('PT 对象键名和类名字符串不作为脚本引用，保留同名业务字段', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><app-button :pt="{ text: 'text-foreground', label: 'text-xs', icon: iconClass }" /></template>
<script setup lang="ts">
const themes = [{ value: 'primary', label: '主色', text: '按钮文字', description: '主要操作。' }]
const foreground = { text: '前景文字' }
const iconClass = computed(() => enabled.value ? 'text-2xl!' : 'text-xl!')
</script>`
	const result = plugin.transform(code, 'pages/button.uvue')
	assert.ok(result)
	assert.match(result.code, /label: '主色', text: '按钮文字', description: '主要操作。'/)
	assert.match(result.code, /const foreground = \{ text: '前景文字' \}/)
	assert.match(result.code, /:pt="__twPt\(/)
	assert.match(result.code, /'text-2xl!' : 'text-xl!'/)
})

test('规范化已配置的对象成员及其引用的类名表达式', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><app-button class="p-1!" hover-class="bg-red-500!" :class="buttonStyle" :pt="{ root: 'p-0!', text: textClass }" /></template><script setup>const textClass = computed(() => active.value ? 'text-white!' : 'text-black!'); const buttonStyle = computed(() => ['rounded-md!', active.value ? 'bg-blue-500!' : 'bg-gray-500!'])</script>`
	const result = plugin.transform(code, 'pages/button.uvue')

	assert.ok(result.code.includes(`class="${toSafeClassName('p-1!')}"`))
	assert.ok(result.code.includes(`hover-class="${toSafeClassName('bg-red-500!')}"`))
	assert.ok(result.code.includes(':class="__twClass(buttonStyle)"'))
	assert.ok(result.code.includes(':pt="__twPt('))
	assert.ok(result.code.includes("root: 'p-0!'"))
	assert.ok(result.code.includes("'text-white!'"))
	assert.ok(result.code.includes("'bg-blue-500!'"))
})

test('不规范化无关属性或业务字符串', () => {
	const plugins = uniAppXTailwind({ customAttributes: { '*': ['pt'] } })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const code = `<template><app-dialog title="text-[#fff]" /></template><script setup>const message = 'p-0!'</script>`
	const result = plugin.transform(code, 'pages/dialog.uvue')

	assert.equal(result, null)
})

test('为使用 @apply 的 Vue 样式注入 Tailwind 引用', () => {
	const plugins = uniAppXTailwind({ reference: '/project/tailwind.css' })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-reference')
	const code = '.button { @apply flex-row items-center; }'
	const result = plugin.transform(code, 'pages/index.uvue?vue&type=style&index=0&lang.scss')

	assert.match(result.code, /^@reference "\/project\/tailwind\.css";/)
	assert.match(result.code, /@apply flex-row items-center/)
})

test('为内联 Vue 样式模块注入 Tailwind 引用', () => {
	const plugins = uniAppXTailwind({ reference: '/project/tailwind.css' })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-reference')
	const code = `export default ${JSON.stringify('.button { @apply flex-row; }')}`
	const result = plugin.transform(code, 'App.uvue?vue&type=style&index=0&inline&lang.css')

	assert.match(result.code, /@reference \\"\/project\/tailwind\.css\\";/)
})

test('编译 Vue 样式模块中残留的 @apply 指令', async () => {
	const reference = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ reference })
	const referencePlugin = plugins.find((item) => item.name === 'uniappx-tailwind-reference')
	const fallbackPlugin = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
	const code = `const __vite__css = ${JSON.stringify(
		'.button { @apply flex-row items-center p-4; }'
	)}\n__vite__updateStyle(__vite__id, __vite__css)`
	const referenced = referencePlugin.transform(
		code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)
	const result = await fallbackPlugin.transform(
		referenced.code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)

	assert.doesNotMatch(result.code, /@apply|@reference/)
	assert.match(result.code, /flex-direction:\s*row/)
	assert.match(result.code, /align-items:\s*center/)
	assert.match(result.code, /padding:\s*calc\(var\(--spacing, 0\.25rem\) \* 4\)/)
})

test('转换标准工具类时保留 @apply 的任意值', async () => {
	const reference = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ reference })
	const referencePlugin = plugins.find((item) => item.name === 'uniappx-tailwind-reference')
	const fallbackPlugin = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
	const code = `const __vite__css = ${JSON.stringify(
		'.button { @apply p-4 w-[1rem] text-[14px]; }'
	)}`
	const referenced = referencePlugin.transform(
		code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)
	const result = await fallbackPlugin.transform(
		referenced.code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)

	assert.doesNotMatch(result.code, /@apply|@reference/)
	assert.match(result.code, /padding:\s*calc\(var\(--spacing, 0\.25rem\) \* 4\)/)
	assert.match(result.code, /width:\s*1rem/)
	assert.match(result.code, /font-size:\s*14px/)
})

test('@apply 工具类共用属性时保留任意值声明', async () => {
	const reference = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ reference })
	const referencePlugin = plugins.find((item) => item.name === 'uniappx-tailwind-reference')
	const fallbackPlugin = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
	const code = `const __vite__css = ${JSON.stringify('.button { @apply p-4 p-[12px]; }')}`
	const referenced = referencePlugin.transform(
		code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)
	const result = await fallbackPlugin.transform(
		referenced.code,
		'pages/index.uvue?vue&type=style&index=0&lang.scss'
	)

	assert.match(result.code, /padding:\s*calc\(var\(--spacing, 0\.25rem\) \* 4\)/)
	assert.match(result.code, /padding:\s*12px/)
})

test('规范化模板类名时保留其任意值', async () => {
	const plugins = uniAppXTailwind()
	const templatePlugin = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
	const compatPlugin = plugins.find((item) => item.name === 'uniappx-tailwind-vapor-compat')
	const template = templatePlugin.transform(
		'<template><view class="w-[1rem] h-[50vw] p-4" /></template>',
		'pages/index.uvue'
	)
	assert.ok(template.code.includes(`class="${safeClasses('w-[1rem] h-[50vw] p-4')}"`))

	const result = await compatPlugin.transform(
		'.w-\\[1rem\\] { width: 1rem; } .h-\\[50vw\\] { height: 50vw; } .p-4 { padding: calc(1px * 4); }',
		'pages/index.css'
	)
	assert.match(
		result.code,
		new RegExp(`\\.${toSafeClassName('w-[1rem]')}\\s*\\{\\s*width:\\s*1rem`)
	)
	assert.match(
		result.code,
		new RegExp(`\\.${toSafeClassName('h-[50vw]')}\\s*\\{\\s*height:\\s*50vw`)
	)
	assert.match(result.code, /\.p-4\s*\{\s*padding:\s*calc\(1px \* 4\)/)
})

test('Tailwind 编译后清理内联 Vue 样式模块', async () => {
	const plugins = uniAppXTailwind({
		include: [/\.css$/, /App\.uvue\?vue&type=style/]
	})
	const compatPlugin = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-vapor-compat')
	const code = `export default ${JSON.stringify(
		'.button { display: flex; flex-direction: row; }'
	)}`
	const result = await compatPlugin.transform(
		code,
		'App.uvue?vue&type=style&index=0&inline&lang.css'
	)

	assert.match(result.code, /flex-direction:\s*row/)
	assert.match(result.code, /export default/)
})

test('没有相邻 HMR 调用时也能清理 Vite CSS 绑定', async () => {
	const plugins = uniAppXTailwind({
		include: [/\.css$/, /App\.uvue\?vue&type=style/]
	})
	const compatPlugin = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-vapor-compat')
	const code = `const __vite__css = ${JSON.stringify('.text-\\[13px\\] { font-size: 13px; }')}`
	const result = await compatPlugin.transform(
		code,
		'App.uvue?vue&type=style&index=0&inline&lang.css'
	)

	assert.ok(result.code.includes(toSafeClassName('text-[13px]')))
	assert.match(result.code, /font-size:\s*13px/)
})

test('Web 和 App 保留主题变量及配色方案媒体查询', async () => {
	const previousPlatform = process.env.UNI_PLATFORM
	try {
		for (const platform of ['web', 'app-android']) {
			process.env.UNI_PLATFORM = platform
			const appPlugin = uniAppXTailwind({
				entry: hostFile('theme.css')
			}).find((item) => item.name === 'uniappx-tailwind-app-style')
			const result = await appPlugin.transform(
				`@import "${hostFile('theme.css')}";`,
				'App.uvue?vue&type=style&index=0&lang.css'
			)

			assert.match(result.code, /--brand:\s*#[\da-f]{6}/i)
			assert.match(result.code, /@media\s*\(prefers-color-scheme:\s*dark\)/)
			assert.match(result.code, /--brand:\s*#3d8fff/)
			assert.doesNotMatch(result.code, /(?:constant|env)\(safe-area-inset-/)
		}
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
	}
})

test('Tailwind 编译 App 入口前过滤条件式 CSS 导入', async () => {
	const previousPlatform = process.env.UNI_PLATFORM
	process.env.UNI_PLATFORM = 'app-android'
	try {
		const entry = hostFile('platform.css')
		const plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-app-style'
		)
		const result = await plugin.transform(
			`@import "${entry}";`,
			'App.uvue?vue&type=style&index=0&lang.css'
		)

		assert.match(result.code, /var\(--uni-safe-area-inset-top\)/)
		assert.doesNotMatch(result.code, /(?:constant|env)\(safe-area-inset-/)
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
	}
})

test('保持 uni 样式占位符不变', async () => {
	const plugins = uniAppXTailwind({ include: [/App\.uvue\?vue&type=style/] })
	const compatPlugin = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-vapor-compat')
	const code = 'export default {"__js_style_placeholder__":"882b4d90"}'
	const result = await compatPlugin.transform(
		code,
		'App.uvue?vue&type=style&index=0&inline&lang.css'
	)

	assert.equal(result, null)
})

test('为 App 样式注入 Tailwind 主题导入', async () => {
	const plugins = uniAppXTailwind({
		entry: hostFile('tailwind.css')
	})
	const appPlugin = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
	const result = await appPlugin.transform(
		"@import './tailwind.css';",
		`${hostFile('App.uvue')}?vue&type=style&index=0&lang.css`
	)

	assert.doesNotMatch(result.code, /@import ['"]tailwindcss\/theme\.css['"];/)
	assert.match(result.code, /page\s*\{/)
})

test('已扫描源码类名变化时更新 App 样式模块', async () => {
	const plugins = uniAppXTailwind({ entry: hostFile('tailwind.css') })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const sourceModule = { id: hostFile('pages/index.uvue') }
	const appStyleModule = { id: `${hostFile('App.uvue')}?vue&type=style&index=0&lang.css` }
	await plugin.transform("@import './tailwind.css';", appStyleModule.id)
	let invalidated = false
	const result = await plugin.handleHotUpdate({
		file: sourceModule.id,
		modules: [sourceModule],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([[appStyleModule.id, appStyleModule]]),
				invalidateModule(module) {
					assert.equal(module, appStyleModule)
					invalidated = true
				}
			}
		}
	})

	assert.equal(invalidated, true)
	assert.deepEqual(result, [sourceModule, appStyleModule])
})

test('Tailwind 入口自身变化也视为源码变化', async (t) => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-entry-hmr-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const entry = join(directory, 'tailwind.css')
	await writeFile(entry, '.shared { color: red; }')
	const plugins = uniAppXTailwind({ entry })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const appStyleModule = { id: '/project/App.uvue?vue&type=style&index=0&lang.css' }
	const invalidatedModules = []
	const result = await plugin.handleHotUpdate({
		file: entry,
		modules: [],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([[appStyleModule.id, appStyleModule]]),
				invalidateModule(module) {
					invalidatedModules.push(module)
				}
			}
		}
	})

	assert.deepEqual(invalidatedModules, [appStyleModule])
	assert.deepEqual(result, [appStyleModule])
})

test('忽略不可能包含 Tailwind 类名的文件', async () => {
	const plugins = uniAppXTailwind({ entry: '/project/tailwind.css' })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const appStyleModule = { id: '/project/App.uvue?vue&type=style&index=0&lang.css' }
	let invalidated = false
	const result = await plugin.handleHotUpdate({
		file: '/project/notes.md',
		modules: [],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([[appStyleModule.id, appStyleModule]]),
				invalidateModule() {
					invalidated = true
				}
			}
		}
	})

	assert.equal(invalidated, false)
	assert.equal(result, undefined)
})

test('编译和刷新 App 样式时保留原生 CSS 导入与字体', async () => {
	const entry = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ entry, componentLocalStyles: false })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const id = `${hostFile('App.uvue')}?vue&type=style&index=0&lang.css`
	const source = `@import './platform.css';
@import './tailwind.css';
@font-face { font-family: iconfont; src: url('/static/font/iconfont.ttf'); }
.app-custom { color: red; }`
	const initial = await plugin.transform(source, id)
	const updated = await plugin.transform(initial.code, id)

	for (const result of [initial, updated]) {
		assert.match(result.code, /^@import ['"]\.\/platform\.css['"];/)
		assert.match(result.code, /@font-face\s*\{\s*font-family: iconfont/)
		assert.match(result.code, /url\('\/static\/font\/iconfont\.ttf'\)/)
		assert.match(result.code, /\.app-custom\s*\{\s*color: red/)
		assert.match(result.code, /padding:\s*12px/)
		assert.doesNotMatch(result.code, /@import ['"]\.\/tailwind\.css['"];/)
	}
})

test('合并并发 Tailwind 编译，内容未变的 watcher 通知复用入口', async () => {
	const entry = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ entry, debug: true })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const id = `${hostFile('App.uvue')}?vue&type=style`
	const context = { addWatchFile() {} }
	const messages = []
	const originalInfo = console.info
	console.info = (...args) => messages.push(args.join(' '))
	try {
		await Promise.all([
			plugin.transform.call(context, "@import './tailwind.css';", id),
			plugin.transform.call(context, "@import './tailwind.css';", id)
		])
		assert.equal(
			messages.filter((message) => message.includes('Tailwind compile start')).length,
			1
		)

		await plugin.handleHotUpdate({
			file: hostFile('pages/index.uvue'),
			modules: [],
			server: { moduleGraph: { idToModuleMap: new Map() } }
		})
		await plugin.transform.call(context, "@import './tailwind.css';", id)
		assert.equal(
			messages.filter((message) => message.includes('Tailwind compile start')).length,
			1
		)
	} finally {
		console.info = originalInfo
	}
})

test('监听 Tailwind 入口及扫描到的源码', async () => {
	const entry = hostFile('tailwind.css')
	const plugins = uniAppXTailwind({ entry })
	const plugin = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const id = `${hostFile('App.uvue')}?vue&type=style&index=0&lang.css`
	const watched = []
	const context = {
		addWatchFile(file) {
			watched.push(file)
		}
	}
	await plugin.transform.call(context, "@import './tailwind.css';", id)

	assert.ok(watched.includes(entry))
	assert.ok(watched.some((file) => /\.uvue$/.test(file)))
	assert.equal(watched.length, new Set(watched).size)
})

test('入口并发缓存检查只扫描一次，独立请求仍发现漏通知的源码变更', async (t) => {
	const directory = await fsPromises.realpath(
		await mkdtemp(join(temporaryParent, 'tailwind-signature-check-'))
	)
	t.after(() => rm(directory, { recursive: true, force: true }))
	const entry = join(directory, 'tailwind.css')
	const page = join(directory, 'Page.uvue')
	await writeFile(
		entry,
		`@import ${JSON.stringify(require.resolve('tailwindcss/utilities.css'))} source(none); @source './*.uvue';`
	)
	const source = (size, value) =>
		`<template><view class="p-[${size}px]" /></template><script setup>const value = ${value}</script>`
	await writeFile(page, source(12, 1))
	const app = uniAppXTailwind({ entry, componentLocalStyles: false }).find(
		(plugin) => plugin.name === 'uniappx-tailwind-app-style'
	)
	const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
	const compile = () => app.transform("@import './tailwind.css';", id)
	await compile()
	const counts = { stat: 0, readdir: 0 }
	const spies = Object.keys(counts).map((name) => {
		const original = fsPromises[name]
		return t.mock.method(fsPromises, name, (...args) => {
			counts[name]++
			return original(...args)
		})
	})
	syncBuiltinESMExports()
	try {
		await compile()
		const single = { ...counts }
		assert.ok(single.stat > 0 && single.readdir > 0)
		counts.stat = counts.readdir = 0
		await Promise.all([compile(), compile(), compile()])
		assert.deepEqual(counts, single, '同轮并发请求共用签名检查')
		await writeFile(page, source(12, 2))
		counts.stat = counts.readdir = 0
		await compile()
		assert.deepEqual(counts, single, '纯逻辑变化复用本请求已取得的签名，不再次扫描')
		await writeFile(page, source(123, 2))
		assert.match((await compile()).code, /padding:\s*123px/)
		assert.doesNotMatch((await compile()).code, /padding:\s*12px/)
	} finally {
		for (const spy of spies) spy.mock.restore()
		syncBuiltinESMExports()
	}
})

test('同轮 Rollup 构建复用入口签名，构建结束后仍检查漏报的源码变化', async (t) => {
	const directory = await fsPromises.realpath(
		await mkdtemp(join(temporaryParent, 'tailwind-build-scan-'))
	)
	t.after(() => rm(directory, { recursive: true, force: true }))
	const entry = join(directory, 'tailwind.css')
	const page = join(directory, 'Page.uvue')
	await writeFile(
		entry,
		`@import ${JSON.stringify(require.resolve('tailwindcss/utilities.css'))} source(none); @source './*.uvue';`
	)
	const source = (size) => `<template><view class="p-[${size}px]" /></template>`
	await writeFile(page, source(12))
	const plugins = uniAppXTailwind({ entry, componentLocalStyles: false })
	const app = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
	const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
	const compile = () => app.transform("@import './tailwind.css';", id)
	app.configResolved({ command: 'build', root: directory, build: { outDir: 'dist' } })
	app.buildStart.call({
		resolve() {
			return null
		}
	})
	await compile()
	let scans = 0
	const readdir = fsPromises.readdir
	const spy = t.mock.method(fsPromises, 'readdir', (...args) => {
		scans++
		return readdir(...args)
	})
	syncBuiltinESMExports()
	try {
		await compile()
		assert.equal(scans, 0, '同轮后续样式转换不应重新遍历目录')
		await writeFile(page, source(13))
		app.watchChange(page)
		assert.match((await compile()).code, /padding:\s*13px/)
		app.buildEnd()
		await writeFile(page, source(14))
		scans = 0
		assert.match((await compile()).code, /padding:\s*14px/)
		assert.ok(scans > 0, '独立请求仍应发现 watcher 漏报')
	} finally {
		spy.mock.restore()
		syncBuiltinESMExports()
	}
})

test('@apply 热编译复用未变样式，主题依赖变化时重新生成声明', async (t) => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-apply-cache-'))
	try {
		const entry = join(directory, 'tailwind.css')
		const theme = join(directory, 'theme.css')
		await writeFile(entry, "@import './theme.css';")
		await writeFile(theme, '@theme inline { --spacing: 12px; }')
		// 固定为编译前的时间，避免文件系统毫秒小数触发保守的并发变更检查。
		const writtenAt = new Date(Date.now() - 1000)
		await fsPromises.utimes(entry, writtenAt, writtenAt)
		await fsPromises.utimes(theme, writtenAt, writtenAt)
		const plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-apply-fallback'
		)
		const processCss = postcss.Processor.prototype.process
		let compilations = 0
		t.mock.method(postcss.Processor.prototype, 'process', function (...args) {
			compilations += 1
			return processCss.apply(this, args)
		})
		const id = join(directory, 'Page.uvue') + '?vue&type=style&index=0&lang.scss'
		const source = '.button { @apply p-1 w-[13px]; }'
		const first = await plugin.transform(source, id)
		assert.match(first.code, /padding:\s*(?:12px|calc\(12px \* 1\))/)
		assert.match(first.code, /width:\s*13px/)
		const initialCompilations = compilations
		assert.deepEqual(await plugin.transform(source, id), first)
		assert.equal(compilations, initialCompilations)
		await writeFile(theme, '@theme inline { --spacing: 123px; }')
		const updated = await plugin.transform(source, id)
		assert.match(updated.code, /padding:\s*(?:123px|calc\(123px \* 1\))/)
		assert.ok(compilations > initialCompilations)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test('@apply 缓存跟踪热更新后新增的嵌套主题依赖', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-apply-import-'))
	try {
		const entry = join(directory, 'tailwind.css')
		const theme = join(directory, 'theme.css')
		const nested = join(directory, 'nested.css')
		await writeFile(entry, "@import './theme.css';")
		await writeFile(theme, '@theme inline { --spacing: 12px; }')
		let plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-apply-fallback'
		)
		const id = join(directory, 'Page.uvue') + '?vue&type=style&index=0&lang.scss'
		const source = '.button { @apply p-1; }'
		await plugin.transform(source, id)
		await writeFile(nested, '@theme inline { --spacing: 123px; }')
		await writeFile(theme, "@import './nested.css';")
		const writtenAt = new Date(Date.now() - 1000)
		await fsPromises.utimes(nested, writtenAt, writtenAt)
		await fsPromises.utimes(theme, writtenAt, writtenAt)
		// Tailwind 内部按文件共享缓存，新插件实例也必须拿到重建后的依赖。
		plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-apply-fallback'
		)
		const watched = []
		const context = { addWatchFile: (file) => watched.push(file) }
		assert.match((await plugin.transform.call(context, source, id)).code, /123px/)
		assert.ok(watched.some((file) => file.replace(/\\/g, '/').endsWith('/nested.css')))
		await writeFile(nested, '@theme inline { --spacing: 1234px; }')
		assert.match((await plugin.transform(source, id)).code, /1234px/)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test('watcher 强制刷新同时间戳、同大小的 @apply 依赖，缓存检查途中也不返回旧值', async (t) => {
	const directory = await fsPromises.realpath(
		await mkdtemp(join(temporaryParent, 'tailwind-apply-watcher-'))
	)
	t.after(() => rm(directory, { recursive: true, force: true }))
	const entry = join(directory, 'tailwind.css')
	const theme = join(directory, 'theme.css')
	const writtenAt = new Date(Date.now() - 2000)
	await writeFile(entry, "@import './theme.css';")
	await writeFile(theme, '@theme inline { --spacing: 12px; }')
	await fsPromises.utimes(entry, writtenAt, writtenAt)
	await fsPromises.utimes(theme, writtenAt, writtenAt)
	const plugins = uniAppXTailwind({ entry })
	const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
	const apply = plugins.find((item) => item.name === 'uniappx-tailwind-apply-fallback')
	const id = join(directory, 'Page.uvue') + '?vue&type=style&index=0&lang.scss'
	const source = '.button { @apply p-1; }'
	await writeFile(
		join(directory, 'Page.uvue'),
		`<template><view /></template><style>${source}</style>`
	)
	await fsPromises.utimes(join(directory, 'Page.uvue'), writtenAt, writtenAt)
	assert.match((await apply.transform(source, id)).code, /12px/)
	for (const value of [13, 14]) {
		await writeFile(theme, `@theme inline { --spacing: ${value}px; }`)
		await fsPromises.utimes(theme, writtenAt, writtenAt)
		const pending = value === 14 ? apply.transform(source, id) : null
		app.watchChange(theme)
		assert.match(
			(await (pending ?? apply.transform(source, id))).code,
			new RegExp(`${value}px`)
		)
	}
})

test('10 条任意值 @apply 合并为两次编译，重复探针只生成一次', async (t) => {
	const plugin = uniAppXTailwind({ entry: hostFile('tailwind.css') }).find(
		(item) => item.name === 'uniappx-tailwind-apply-fallback'
	)
	const processCss = postcss.Processor.prototype.process
	const inputs = []
	t.mock.method(postcss.Processor.prototype, 'process', function (...args) {
		inputs.push(String(args[0]))
		return processCss.apply(this, args)
	})
	const source = Array.from(
		{ length: 10 },
		(_, index) => `.item-${index} { @apply w-[${index + 13}px] leading-[1.7] p-4; }`
	).join('\n')
	const result = await plugin.transform(source, 'Page.uvue?vue&type=style&index=0&lang.scss')
	assert.equal(inputs.length, 2)
	assert.equal((inputs[0].match(/@apply leading-\[1\.7\];/g) ?? []).length, 1)
	for (let index = 0; index < 10; index++)
		assert.match(result.code, new RegExp(`width:\\s*${index + 13}px`))
	assert.doesNotMatch(result.code, /@apply|__tailwind_arbitrary/)
})

test('@apply 编译期间主题再次变化时不会缓存旧声明', async (t) => {
	const directory = await fsPromises.realpath(
		await mkdtemp(join(temporaryParent, 'tailwind-apply-race-'))
	)
	let statSpy
	try {
		const entry = join(directory, 'tailwind.css')
		const theme = join(directory, 'theme.css')
		await writeFile(entry, "@import './theme.css';")
		await writeFile(theme, '@theme inline { --spacing: 12px; }')
		const plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-apply-fallback'
		)
		const statFile = fsPromises.stat
		const processCss = postcss.Processor.prototype.process
		let compiled = false
		t.mock.method(postcss.Processor.prototype, 'process', function (...args) {
			const result = processCss.apply(this, args)
			if (args[1]?.from !== join(directory, 'Page.uvue')) return result
			return result.then((value) => {
				compiled = true
				return value
			})
		})
		let changed = false
		statSpy = t.mock.method(fsPromises, 'stat', async (...args) => {
			if (compiled && args[0] === theme && !changed) {
				changed = true
				await writeFile(theme, '@theme inline { --spacing: 123px; }')
			}
			return statFile(...args)
		})
		syncBuiltinESMExports()
		const id = join(directory, 'Page.uvue') + '?vue&type=style&index=0&lang.scss'
		const source = '.button { @apply p-1; }'
		await plugin.transform(source, id)
		assert.equal(changed, true)
		assert.match((await plugin.transform(source, id)).code, /123px/)
	} finally {
		statSpy?.mock.restore()
		syncBuiltinESMExports()
		await rm(directory, { recursive: true, force: true })
	}
})

test('批量 @apply 输出与独立规则一致，包含重复项和任意值', async () => {
	const reference = hostFile('tailwind.css')
	const plugin = uniAppXTailwind({ reference }).find(
		(item) => item.name === 'uniappx-tailwind-apply-fallback'
	)
	const id = 'pages/index.uvue?vue&type=style&index=0&lang.scss'
	const rules = [
		'.first { @apply flex-row items-center p-4; }',
		'.second { @apply text-brand font-bold; }',
		'.third { @apply flex-row items-center p-4; }',
		'.arbitrary { @apply p-4 p-[1rem]; }',
		'.repeated { @apply p-4 p-[1rem]; }',
		'.dynamic { @apply text-#{map-get($colors, primary)}; }'
	]
	const separate = []
	for (const rule of rules) separate.push((await plugin.transform(rule, id)).code)
	const batched = await plugin.transform(rules.join('\n'), id)
	assert.equal(batched.code, separate.join('\n'))
	assert.match(batched.code, /padding:\s*1rem/)
	assert.match(batched.code, /@apply text-#\{/)
})

test('@apply 只处理真实指令，保留注释、字符串并支持省略末尾分号', async () => {
	const plugin = uniAppXTailwind({ entry: hostFile('tailwind.css') }).find(
		(item) => item.name === 'uniappx-tailwind-apply-fallback'
	)
	const id = 'pages/apply.uvue?vue&type=style&index=0&lang.scss'
	const notes = `/* @apply not-a-real-utility; */
// @apply another-unknown-utility;
.note { --example: '@apply unknown-text;'; }`
	assert.equal((await plugin.transform(notes, id)).code, notes)
	const source = `${notes}
.first { @apply p-4; color: red; }
.last { @apply m-2 }
.dynamic { @apply text-#{map-get($colors, primary)}; }`
	for (const inline of [false, true]) {
		const input = inline ? `export default ${JSON.stringify(source)}` : source
		const result = await plugin.transform(input, id)
		const css = inline ? JSON.parse(result.code.slice('export default '.length)) : result.code
		assert.ok(css.startsWith(notes))
		assert.match(css, /\.first \{ padding:[^}]+color: red;/)
		assert.match(css, /\.last \{ margin:/)
		assert.doesNotMatch(css, /@apply (?:p-4|m-2)/)
		assert.match(css, /@apply text-#\{map-get\(\$colors, primary\)\};/)
	}
})

for (const fails of [false, true]) {
	test(`过期入口编译${fails ? '失败' : '完成'}不覆盖新结果或清除新缓存`, async (t) => {
		const directory = await mkdtemp(join(temporaryParent, 'tailwind-entry-race-'))
		assert.ok(directory.startsWith(join(temporaryParent, 'tailwind-entry-race-')))
		const blocked = Promise.withResolvers()
		const resume = Promise.withResolvers()
		let readSpy = null
		let staleResult = null
		try {
			const entry = join(directory, 'tailwind.css')
			const page = join(directory, 'Page.uvue')
			const source = (size) => `<template><view class="p-[${size}px]" /></template>`
			await writeFile(
				entry,
				`@import ${JSON.stringify(require.resolve('tailwindcss/utilities.css').replace(/\\/g, '/'))} source(none);\n@source './Page.uvue';`
			)
			await writeFile(page, source(20))
			const plugins = uniAppXTailwind({ entry })
			const classes = plugins.find((item) => item.name === 'uniappx-tailwind-important-class')
			const app = plugins.find((item) => item.name === 'uniappx-tailwind-app-style')
			await classes.transform(source(20), page)
			const read = fsPromises.readFile
			let pending = true
			let pageReads = 0
			readSpy = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
				const result = await read(file, ...args)
				if (file !== page) return result
				pageReads++
				if (pending) {
					pending = false
					blocked.resolve()
					await resume.promise
					if (fails) throw new Error('旧扫描读取失败')
				}
				return result
			})
			syncBuiltinESMExports()
			await writeFile(page, source(21))
			app.watchChange(page)
			const stale = classes.transform(source(21), page)
			staleResult = fails ? assert.rejects(stale, /旧扫描读取失败/) : stale
			await blocked.promise
			await writeFile(page, source(22))
			app.watchChange(page)
			assert.match(
				(await classes.transform(source(22), page)).code,
				/\.p-22px\s*\{\s*padding: 22px/
			)
			resume.resolve()
			await staleResult
			const readsAfterLatest = pageReads
			await app.transform(
				"@import './tailwind.css';",
				join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
			)
			assert.equal(pageReads, readsAfterLatest, '最新入口应继续命中缓存')
			const final = await classes.transform(source(22), page)
			assert.match(final.code, /\.p-22px\s*\{\s*padding: 22px/)
			assert.doesNotMatch(final.code, /\.p-21px\s*\{/)
		} finally {
			resume.resolve()
			await Promise.allSettled([staleResult])
			readSpy?.mock.restore()
			syncBuiltinESMExports()
			await rm(directory, { recursive: true, force: true })
		}
	})
}

for (const nested of [false, true]) {
	test(`${nested ? '首次嵌套 CSS' : '入口'}读取期间发生变更时重新读取，不缓存过期 CSS`, async (t) => {
		const directory = await mkdtemp(join(temporaryParent, 'tailwind-entry-read-race-'))
		assert.ok(directory.startsWith(join(temporaryParent, 'tailwind-entry-read-race-')))
		const blocked = Promise.withResolvers()
		const resume = Promise.withResolvers()
		let readSpy = null
		let compilation = null
		try {
			const entry = join(directory, 'tailwind.css')
			const target = nested ? join(directory, 'theme.css') : entry
			if (nested) await writeFile(entry, "@import './theme.css';")
			await writeFile(target, '.token { padding: 1px; }')
			const app = uniAppXTailwind({ entry }).find(
				(item) => item.name === 'uniappx-tailwind-app-style'
			)
			const read = fsPromises.readFile
			let pending = true
			readSpy = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
				const result = await read(file, ...args)
				if (file === target && pending) {
					pending = false
					blocked.resolve()
					await resume.promise
				}
				return result
			})
			syncBuiltinESMExports()
			compilation = app.transform(
				"@import './tailwind.css';",
				join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
			)
			await blocked.promise
			await writeFile(target, '.token { padding: 2px; }')
			app.watchChange(target)
			resume.resolve()
			const result = await compilation
			assert.match(result.code, /padding: 2px/)
			assert.doesNotMatch(result.code, /padding: 1px/)
			assert.equal(
				(
					await app.transform(
						"@import './tailwind.css';",
						join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
					)
				).code,
				result.code
			)
		} finally {
			resume.resolve()
			await Promise.allSettled([compilation])
			readSpy?.mock.restore()
			syncBuiltinESMExports()
			await rm(directory, { recursive: true, force: true })
		}
	})
}

test('复用未变化的 App 输出并刷新已变化的 CSS 依赖', async () => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-css-cache-'))
	try {
		const entry = join(directory, 'tailwind.css')
		const dependency = join(directory, 'theme.css')
		await writeFile(entry, "@import './theme.css';")
		await writeFile(dependency, '.test { padding: 1px; }')
		const plugin = uniAppXTailwind({ entry }).find(
			(item) => item.name === 'uniappx-tailwind-app-style'
		)
		const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
		const source = "@import './tailwind.css';"
		const first = await plugin.transform(source, id)
		assert.equal(await plugin.transform(source, id), first)
		assert.equal(await plugin.transform(first.code, id), first)
		await writeFile(dependency, '.test { padding: 123px; }')
		const changed = await plugin.transform(source, id)
		assert.notEqual(changed, first)
		assert.match(changed.code, /padding:\s*123px/)
		const custom = await plugin.transform(source + '\n.custom { color: red; }', id)
		assert.match(custom.code, /color: red/)
		assert.equal(await plugin.transform('.removed { color: blue; }', id), null)
		const restored = await plugin.transform(source, id)
		assert.match(restored.code, /padding:\s*123px/)
		assert.doesNotMatch(restored.code, /\.custom|\.removed/)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test('源码变化时复用 CSS 导入并刷新所有已变化的主题依赖', async (t) => {
	const directory = await mkdtemp(join(temporaryParent, 'tailwind-css-incremental-'))
	const readFile = fsPromises.readFile
	const reads = []
	const readSpy = t.mock.method(fsPromises, 'readFile', (...args) => {
		if (String(args[0]).startsWith(directory)) reads.push(String(args[0]))
		return readFile(...args)
	})
	syncBuiltinESMExports()
	try {
		const entry = join(directory, 'tailwind.css')
		const theme = join(directory, 'theme.css')
		const skin = join(directory, 'skin.css')
		const page = join(directory, 'page.uvue')
		const tailwind = require.resolve('tailwindcss/index.css')
		await writeFile(
			entry,
			`@import ${JSON.stringify(tailwind)} source(none);\n@import './theme.css';\n@import './skin.css';\n@source './*.uvue';`
		)
		await writeFile(theme, '.theme { color: red; }')
		await writeFile(skin, '.skin { padding: 1px; }')
		await writeFile(page, '<template><view class="w-[12341px]" /></template>')
		const plugin = uniAppXTailwind({ entry, componentLocalStyles: false }).find(
			(item) => item.name === 'uniappx-tailwind-app-style'
		)
		const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
		const source = "@import './tailwind.css';"
		const notifySourceChange = (file) => {
			plugin.watchChange(file)
			plugin.handleHotUpdate({
				file,
				modules: [],
				server: {
					moduleGraph: {
						idToModuleMap: new Map(),
						invalidateModule() {}
					}
				}
			})
		}
		assert.match((await plugin.transform(source, id)).code, /width:\s*12341px/)
		reads.length = 0
		await writeFile(page, '<template><view class="w-[12343px]" /></template>')
		notifySourceChange(page)
		const updated = await plugin.transform(source, id)
		assert.match(updated.code, /width:\s*12343px/)
		assert.deepEqual(
			reads.filter((file) => file.endsWith('.css')),
			[]
		)

		// 页面与多个 CSS 依赖同批变化，不能只处理第一个变更文件。
		await writeFile(page, '<template><view class="w-[12345px]" /></template>')
		await writeFile(theme, '.theme { color: blue; }')
		await writeFile(skin, '.skin { padding: 123px; }')
		notifySourceChange(page)
		notifySourceChange(theme)
		notifySourceChange(skin)
		const changed = await plugin.transform(source, id)
		assert.match(changed.code, /width:\s*12345px/)
		assert.match(changed.code, /color:\s*blue/)
		assert.match(changed.code, /padding:\s*123px/)
	} finally {
		readSpy.mock.restore()
		syncBuiltinESMExports()
		await rm(directory, { recursive: true, force: true })
	}
})
