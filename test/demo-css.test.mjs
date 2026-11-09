import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes, createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
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
		for (const demo of demos) {
			const cssProperty = demo.property === 'lines' ? '-webkit-line-clamp' : demo.property
			for (const sample of demo.cases) {
				const declarations = []
				for (const name of sample.className.split(/\s+/)) {
					const rule = rules.get('.' + toSafeClassName(name))
					assert.ok(rule, `${platform}: ${demo.property} 的 ${name} 没有生成 CSS`)
					rule.walkDecls((decl) => declarations.push(decl))
				}
				assert.ok(
					declarations.some((decl) => decl.prop === cssProperty),
					`${platform}: ${sample.className} 没有生成 ${cssProperty}`
				)
			}
		}
	}
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
					output: 'bin'
				})
				assert.deepEqual(
					parsed.messages.map((message) => message.text),
					[],
					`${platform}: ${page}`
				)
			}
		}
	}
})
