import assert from 'node:assert/strict'
import fsPromises from 'node:fs/promises'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import postcss from 'postcss'
import { uniAppXTailwind } from '../src/index.mjs'
import { collectScriptImports } from '../src/script-imports.mjs'
import { createConditionContext, filterConditions } from '../src/conditions.mjs'
import {
	collectLocalStyles,
	collectSourceCache,
	getLocalStyleTargetIndex
} from '../src/local-styles.mjs'

const require = createRequire(import.meta.url)

/** 只计入带入口版本标记的 Tailwind 调用，记录补编译显式追加的候选。 */
function trackEntryCompilations(t, entry) {
	const inputs = []
	const processCss = postcss.Processor.prototype.process
	t.mock.method(postcss.Processor.prototype, 'process', function (...args) {
		const [source, options] = args
		if (
			options?.from === entry &&
			source.first?.type === 'comment' &&
			source.first.text.startsWith('uniappx-tailwind scan revision ')
		)
			inputs.push(
				source.nodes
					.filter(
						(node) =>
							node.type === 'atrule' &&
							node.name === 'source' &&
							node.params.startsWith('inline(')
					)
					.map((node) => node.params)
			)
		return processCss.apply(this, args)
	})
	return inputs
}

test('条件编译使用自定义宏和版本，跳过字符串伪指令并检查配对', (t) => {
	const names = [
		'UNI_CUSTOM_CONTEXT',
		'UNI_COMPILER_VERSION',
		'UNI_UTS_PLATFORM',
		'UNI_APP_X_DOM2'
	]
	const previous = names.map((name) => process.env[name])
	t.after(() =>
		names.forEach((name, index) => {
			if (previous[index] == null) delete process.env[name]
			else process.env[name] = previous[index]
		})
	)
	process.env.UNI_CUSTOM_CONTEXT = '{"FEATURE-A":true,"DISABLED":false}'
	process.env.UNI_COMPILER_VERSION = '5.33'
	process.env.UNI_UTS_PLATFORM = 'app-ios'
	process.env.UNI_APP_X_DOM2 = 'true'
	const context = createConditionContext('web')
	const source = `const example = \`// #ifdef APP\nimport './example'\n// #endif\`
// #ifdef FEATURE-A
// #if (uniVersion >= 5.31 && VUE3) || DISABLED
import './enabled'
// #endif
// #ifndef WEB
import './disabled'
// #endif
// #endif
<!-- #ifdef APP -->
<script src="./native.ts"></script>
<!-- #endif -->`
	const filtered = filterConditions(source, context)
	assert.deepEqual([...collectScriptImports(filtered)], ['./enabled'])
	assert.ok(filtered.includes('const example = `// #ifdef APP'))
	assert.ok(!filtered.includes('native.ts'))
	assert.equal('APP_IOS' in createConditionContext('app-android'), false)
	assert.equal(createConditionContext('app').APP_IOS, true)
	assert.throws(() => filterConditions('// #ifdef WEB', context), /未闭合/)
	assert.throws(() => filterConditions('// #endif', context), /多余/)
	assert.throws(() => filterConditions('// #if WEB()\n// #endif', context), /无效/)
})

test('实体分隔的 class 同时生成局部 CSS，扫描排除和 HMR 继续生效', async (t) => {
	const source = '<template><view class="p-4!&#32;text-xl!" /></template>'
	const fixture = await createFixture(t, { page: source })
	const compilations = trackEntryCompilations(t, fixture.entry)
	const plugins = getPlugins(fixture.entry)
	let result = await plugins.classes.transform(source, fixture.page)
	assert.equal(compilations.length, 2)
	assert.match(result.code, /class="p-4-important text-xl-important"/)
	assert.match(result.code, /\.p-4-important\s*\{/)
	assert.match(result.code, /\.text-xl-important\s*\{/)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(app.css, /\.p-4-important\s*\{/)
	const changed = source.replace('p-4!', 'p-8!')
	await writeFile(fixture.page, changed)
	plugins.app.watchChange(fixture.page)
	result = await plugins.classes.transform(changed, fixture.page)
	assert.match(result.code, /\.p-8-important\s*\{/)
	assert.doesNotMatch(result.code, /\.p-4-important\s*\{/)
	await writeFile(
		fixture.entry,
		(await readFile(fixture.entry, 'utf8')) + '\n@source not inline("p-8!");'
	)
	plugins.app.watchChange(fixture.entry)
	result = await plugins.classes.transform(changed, fixture.page)
	assert.doesNotMatch(result.code, /\.p-8-important\s*\{/)
	await writeFile(
		fixture.entry,
		(await readFile(fixture.entry, 'utf8')) + '\n@source not "./page.uvue";'
	)
	plugins.app.watchChange(fixture.entry)
	result = await plugins.classes.transform(changed, fixture.page)
	assert.doesNotMatch(result.code, /Tailwind 局部工具类/)
})

test('普通来源已生成全部实体候选时仅编译一次，删除来源后 HMR 仍补齐 CSS', async (t) => {
	const source = '<template><view class="p-4!&#32;text-xl!" /></template>'
	const fixture = await createFixture(t, { page: source })
	const ordinary = join(fixture.directory, 'ordinary.uvue')
	await writeFile(ordinary, '<template><view class="p-4! text-xl!" /></template>')
	const compilations = trackEntryCompilations(t, fixture.entry)
	const plugins = getPlugins(fixture.entry)
	let result = await plugins.classes.transform(source, fixture.page)
	assert.deepEqual(compilations, [[]])
	assert.match(result.code, /\.p-4-important\s*\{[^}]*padding:/)
	assert.match(result.code, /\.text-xl-important\s*\{[^}]*font-size:/)
	await rm(ordinary)
	plugins.app.watchChange(ordinary)
	compilations.length = 0
	result = await plugins.classes.transform(source, fixture.page)
	assert.equal(compilations.length, 2)
	assert.deepEqual(compilations[0], [])
	assert.match(result.code, /\.p-4-important\s*\{[^}]*padding:/)
	assert.match(result.code, /\.text-xl-important\s*\{[^}]*font-size:/)
})

test('实体候选只补首次缺失项，候选排除和来源排除继续生效', async (t) => {
	const source = '<template><view class="p-4!&#32;text-xl!" /></template>'
	const fixture = await createFixture(t, { page: source })
	await writeFile(
		join(fixture.directory, 'ordinary.uvue'),
		'<template><view class="p-4!" /></template>'
	)
	const compilations = trackEntryCompilations(t, fixture.entry)
	const plugins = getPlugins(fixture.entry)
	let result = await plugins.classes.transform(source, fixture.page)
	assert.deepEqual(compilations, [[], ['inline("text-xl!")']])
	assert.match(result.code, /\.p-4-important\s*\{[^}]*padding:/)
	assert.match(result.code, /\.text-xl-important\s*\{[^}]*font-size:/)
	await writeFile(
		fixture.entry,
		(await readFile(fixture.entry, 'utf8')) + '\n@source not inline("text-xl!");'
	)
	plugins.app.watchChange(fixture.entry)
	compilations.length = 0
	result = await plugins.classes.transform(source, fixture.page)
	assert.deepEqual(compilations, [[], ['inline("text-xl!")']])
	assert.match(result.code, /\.p-4-important\s*\{[^}]*padding:/)
	assert.doesNotMatch(result.code, /\.text-xl-important\s*\{/)
	await writeFile(
		fixture.entry,
		(await readFile(fixture.entry, 'utf8')) + '\n@source not "./page.uvue";'
	)
	plugins.app.watchChange(fixture.entry)
	compilations.length = 0
	result = await plugins.classes.transform(source, fixture.page)
	assert.deepEqual(compilations, [[]])
	assert.doesNotMatch(result.code, /Tailwind 局部工具类/)
})

test('手写同名 CSS 和 utility 关系选择器不能充当已生成候选的证据', async (t) => {
	const source = '<template><view class="p-4!&#32;text-xl!" /></template>'
	const fixture = await createFixture(t, {
		page: source,
		theme: `.p-4\\! { color: red; } .text-xl\\! { color: blue; }
@utility reverse { .p-4\\! & { color: green; } }
@source inline("reverse");`
	})
	const compilations = trackEntryCompilations(t, fixture.entry)
	const plugins = getPlugins(fixture.entry)
	const result = await plugins.classes.transform(source, fixture.page)
	assert.equal(compilations.length, 2)
	assert.match(result.code, /\.p-4-important\s*\{[^}]*padding:/)
	assert.match(result.code, /\.text-xl-important\s*\{[^}]*font-size:/)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(app.css, /\.p-4-important\s*\{\s*color: red;/)
	assert.match(app.css, /\.text-xl-important\s*\{\s*color: blue;/)
})

test('依赖收集遵守脚本条件编译，失效分支不解析，真实缺失仍报错', async (t) => {
	const source = `<template><view class="p-4"><text>Don't stop</text></view></template>
<script setup>
// #ifdef APP
import './native-only.ts'
// #endif
// #ifdef WEB || MP
import './shared.ts'
// #endif
</script>`
	const fixture = await createFixture(t, { page: source })
	await writeFile(
		join(fixture.directory, 'shared.ts'),
		`// #ifndef WEB || MP\nimport './native-only.ts'\n// #endif\nexport const value = 'p-71'`
	)
	for (const platform of [
		'web',
		'mp-weixin',
		'mp-alipay',
		'app-android',
		'app-ios',
		'app-harmony'
	]) {
		const plugins = getPlugins(fixture.entry, {}, platform)
		const imports = []
		plugins.app.buildStart.call({
			resolve(specifier) {
				imports.push(specifier)
				return specifier === './shared.ts'
					? { id: join(fixture.directory, 'shared.ts') }
					: null
			}
		})
		if (platform.startsWith('app-')) {
			await assert.rejects(
				plugins.classes.transform(source, fixture.page),
				/无法解析脚本依赖/
			)
		} else {
			const result = await plugins.classes.transform(source, fixture.page)
			assert.match(result.code, /\.p-71\s*\{/)
			assert.deepEqual(imports, ['./shared.ts'])
		}
	}
})

test('SFC 条件编译区分模板文案、HTML 注释和脚本字符串并保留源码偏移', () => {
	const source = `<template>
<text>Don't stop; "quoted" and \`template\` text</text>
<text>{{ '<style>' }}</text>
<textarea><style></textarea>
<!-- #ifdef APP -->
<view>native only</view>
<!-- #endif -->
</template>
<!-- #ifdef APP -->
<script src="./native.ts" />
<!-- #endif -->
<script setup>
const sample = '// #ifdef APP'
// #ifdef APP
import './native.ts'
// #endif
// #ifdef WEB
import './web.ts'
// #endif
</script>`
	const filtered = filterConditions(source, createConditionContext('web'), 'page.uvue')
	assert.equal(filtered.length, source.length)
	assert.ok(filtered.includes(`Don't stop; "quoted" and \`template\` text`))
	assert.ok(filtered.includes("const sample = '// #ifdef APP'"))
	assert.doesNotMatch(filtered, /native only|\.\/native\.ts/)
	assert.match(filtered, /import '\.\/web\.ts'/)
	assert.equal(filtered.indexOf('<script setup>'), source.indexOf('<script setup>'))
	assert.throws(
		() => filterConditions('<template><!-- #endif --></template>', {}, 'page.uvue'),
		/多余/
	)
	assert.throws(
		() => filterConditions('<script>// #ifdef WEB\n</script>', {}, 'page.uvue'),
		/未闭合/
	)
})

test('局部 CSS 跳过注释、脚本字符串、模板文本和失效分支中的 style', async (t) => {
	const examples = [
		'<!-- <style>.fake { color: red; }</style> -->',
		'<script setup>const example = "<style>.fake { color: red; }</style>"</script>',
		'<!-- #ifdef APP -->\n<style>.fake { color: red; }</style>\n<!-- #endif -->'
	]
	for (const example of examples) {
		const source = `<template><view class="p-4"><text>{{ '<style>' }}</text><textarea><style></textarea></view></template>\n${example}`
		const fixture = await createFixture(t, { page: source })
		const plugins = getPlugins(fixture.entry)
		const result = await plugins.classes.transform(source, fixture.page)
		assert.ok(result.code.startsWith(source))
		assert.match(
			result.code.slice(source.length),
			/^\n<style scoped>\n\/\* Tailwind 局部工具类 \*\//
		)
		assert.match(result.code.slice(source.length), /\.p-4\s*\{/)
		assert.equal(getLocalStyleTargetIndex(source, true, createConditionContext('web')), 0)
		const refreshed = await plugins.classes.transform(
			'',
			`${fixture.page}?vue&type=style&index=0&lang.css`
		)
		assert.match(refreshed.code, /\.p-4\s*\{/)
	}
})

test('当前平台有效的顶层 style 统一决定 apply 收集、完整注入与 HMR 索引', async (t) => {
	for (const platform of ['web', 'app-android', 'mp-weixin', 'mp-alipay']) {
		const inactive = platform === 'web' ? 'APP' : 'WEB'
		const source = `<template><view class="p-4" /></template>
<!-- <style>.comment { @apply p-8; }</style> -->
<script setup>const sample = '<style>.example { @apply p-8; }</style>'</script>
<!-- #ifdef ${inactive} -->
<style>.disabled { @apply p-12; }</style>
<!-- #endif -->
<style module>.module { color: red; }</style>
<style>.active { @apply p-16; }</style>`
		const fixture = await createFixture(t, { page: source })
		const context = createConditionContext(platform)
		const local = await collectLocalStyles(
			[fixture.page],
			new Set(['p-4', 'p-8', 'p-12', 'p-16']),
			postcss.root(),
			{ appFile: fixture.app, conditionContext: context }
		)
		assert.deepEqual([...local.applyOnlyCandidates], ['p-16'])
		assert.equal(getLocalStyleTargetIndex(source, platform === 'web', context), 1)
		const plugins = getPlugins(fixture.entry, {}, platform)
		const result = await plugins.classes.transform(source, fixture.page)
		const prefix = source.slice(0, source.lastIndexOf('</style>'))
		assert.ok(result.code.startsWith(prefix))
		assert.match(result.code.slice(prefix.length), /Tailwind 局部工具类[\s\S]*\.p-4\s*\{/)
		assert.equal(
			await plugins.classes.transform(
				'.module { color: red; }',
				`${fixture.page}?vue&type=style&index=0&lang.css`
			),
			null
		)
		const refreshed = await plugins.classes.transform(
			'.active { @apply p-16; }',
			`${fixture.page}?vue&type=style&index=1&lang.css`
		)
		assert.match(refreshed.code, /\.p-4\s*\{/)
	}
})

test('自闭合及空 style 的完整转换与 HMR 索引保持一致', async (t) => {
	for (const styles of [
		'<style />',
		'<style scoped/>',
		'<style></style><style scoped />',
		'<style module />'
	]) {
		const source = `<template><view class="p-4" /></template>${styles}`
		const fixture = await createFixture(t, { page: source })
		for (const platform of ['web', 'app-android']) {
			const plugins = getPlugins(fixture.entry, {}, platform)
			const result = await plugins.classes.transform(source, fixture.page)
			assert.ok(result.code.startsWith('<template><view class="p-4" /></template>'))
			const generated = [
				...result.code.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)
			].filter((match) => match[1].includes('Tailwind 局部工具类'))
			assert.equal(generated.length, 1)
			assert.match(generated[0][1], /\.p-4\s*\{/)
			assert.equal(getLocalStyleTargetIndex(source, platform === 'web'), 0)
			const refreshed = await plugins.classes.transform(
				'',
				`${fixture.page}?vue&type=style&index=0&lang.css`
			)
			assert.match(refreshed.code, /\.p-4\s*\{/)
		}
	}
})

test('仅真实 @apply 参与独占候选裁剪，支持无末尾分号', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view /></template>
<style>/* @apply p-4; */ .note { --example: '@apply m-2;'; } .box { @apply p-8 }</style>`
	})
	const result = await collectLocalStyles(
		[fixture.page],
		new Set(['p-4', 'm-2', 'p-8']),
		postcss.root(),
		{ appFile: fixture.app, componentLocalStyles: false }
	)
	assert.deepEqual([...result.applyOnlyCandidates], ['p-8'])
})

test('源码记录缓存命中时复用结果，签名变化后更新候选', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="p-4" /></template>'
	})
	const signatures = new Map([[fixture.page, 'first']])
	const initial = await collectSourceCache([fixture.page], { signatures })
	// 复用首次扫描返回的规范化键，避免 Windows 路径分隔符和大小写影响缓存断言。
	const [recordKey] = initial.records.keys()
	const cached = await collectSourceCache([fixture.page], {
		sourceCache: initial,
		signatures
	})
	assert.equal(cached.stylesChanged, false)
	assert.equal(cached.records.get(recordKey), initial.records.get(recordKey))
	assert.equal(cached.records.get(recordKey).candidates.has('p-4'), true)

	await writeFile(fixture.page, '<template><view class="p-8" /></template>')
	signatures.set(fixture.page, 'second')
	const changed = await collectSourceCache([fixture.page], {
		sourceCache: cached,
		signatures
	})
	assert.equal(changed.stylesChanged, true)
	assert.notEqual(changed.records.get(recordKey), cached.records.get(recordKey))
	assert.equal(changed.records.get(recordKey).candidates.has('p-8'), true)
	assert.equal(changed.records.get(recordKey).candidates.has('p-4'), false)
})

test('脚本依赖识别运行时 import/re-export，跳过类型、注释、字符串和正则', () => {
	const imports = collectScriptImports(`
		import type { A } from './types-a'
		import { type B, type C } from './types-b'
		export type { D } from './types-c'
		export { type E } from './types-d'
		import { type F, value } from './mixed'
		import defaultValue, { type G } from './default'
		export * from './barrel'
		import './side-effect'
		const load = () => import('./lazy')
		const text = "import './fake'"
		const pattern = /import('ghost')/
		// import './comment'
	`)
	assert.deepEqual([...imports], ['./mixed', './default', './barrel', './side-effect', './lazy'])
})

test('热更新只重读变化文件，复用未变 import 并读取共享脚本的最新候选', async (t) => {
	const source =
		'<template><view :class="value" /></template><script setup>import { value } from "./shared.ts"</script>'
	const fixture = await createFixture(t, { page: source })
	const second = join(fixture.directory, 'second.uvue')
	const shared = join(fixture.directory, 'shared.ts')
	const alternative = join(fixture.directory, 'alternative.ts')
	await writeFile(second, source)
	await writeFile(shared, 'export const value = "p-71"')
	await writeFile(alternative, 'export const value = "p-73"')
	const plugins = getPlugins(fixture.entry)
	const resolutions = []
	plugins.app.buildStart.call({
		resolve(specifier, importer) {
			resolutions.push(importer)
			return { id: join(fixture.directory, specifier) }
		}
	})
	await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.equal(resolutions.length, 2)
	resolutions.length = 0
	const reads = []
	const read = fsPromises.readFile
	const spy = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
		if ([fixture.page, second, shared, alternative].includes(file)) reads.push(file)
		return read(file, ...args)
	})
	syncBuiltinESMExports()
	try {
		await writeFile(shared, 'export const value = "p-72"')
		plugins.app.watchChange(shared)
		for (const file of [fixture.page, second]) {
			const output = await plugins.classes.transform(source, file)
			assert.match(output.code, /\.p-72\s*\{[^}]*padding:/)
			assert.doesNotMatch(output.code, /\.p-71\s*\{/)
			await plugins.classes.transform('', `${file}?vue&type=style&index=0&lang.css`)
		}
		assert.deepEqual(reads, [shared], '包括 style-only 转换在内，不重读未变 SFC')
		assert.deepEqual(resolutions, [], '共享脚本内容变化不重解析消费者的 import')
		reads.length = 0
		const changed = source.replace('./shared.ts', './alternative.ts')
		await writeFile(fixture.page, changed)
		// 没有 watcher 通知也要通过签名发现 import 变化。
		await compileApp(plugins.app, fixture.app, fixture.directory)
		assert.match((await plugins.classes.transform(changed, fixture.page)).code, /\.p-73\s*\{/)
		assert.doesNotMatch(
			(await plugins.classes.transform(changed, fixture.page)).code,
			/\.p-72\s*\{/
		)
		assert.match((await plugins.classes.transform(source, second)).code, /\.p-72\s*\{/)
		assert.deepEqual(reads, [fixture.page])
		assert.deepEqual(resolutions, [fixture.page])
	} finally {
		spy.mock.restore()
		syncBuiltinESMExports()
	}
})

test('跨端纯逻辑修改复用入口和最新源码，class 与 @apply 变化仍重建', async (t) => {
	for (const platform of ['web', 'mp-weixin', 'mp-alipay', 'app-android']) {
		await t.test(platform, async (t) => {
			let source =
				'<template><view class="p-4" /></template><script setup lang="ts">const value = 1</script><style>.box { @apply m-2; }</style>'
			const fixture = await createFixture(t, { page: source })
			const plugins = getPlugins(fixture.entry, {}, platform)
			const compilations = trackEntryCompilations(t, fixture.entry)
			await plugins.classes.transform(source, fixture.page)
			assert.equal(compilations.length, 1)
			const writtenAt = new Date(Date.now() - 2000)
			for (const value of [2, 3]) {
				source = source.replace(/const value = \d/, `const value = ${value}`)
				await writeFile(fixture.page, source)
				await fsPromises.utimes(fixture.page, writtenAt, writtenAt)
				plugins.app.watchChange(fixture.page)
				const [output] = await Promise.all([
					plugins.classes.transform(source, fixture.page),
					compileApp(plugins.app, fixture.app, fixture.directory)
				])
				assert.match(output.code, new RegExp(`const value = ${value}`))
				assert.match(output.code, /\.p-4\s*\{/)
				assert.equal(compilations.length, 1)
			}
			for (const [before, after] of [
				['m-2', 'm-3'],
				['p-4', 'p-5']
			]) {
				source = source.replace(before, after)
				await writeFile(fixture.page, source)
				plugins.app.watchChange(fixture.page)
				await plugins.classes.transform(source, fixture.page)
			}
			assert.equal(compilations.length, 3)
			const final = await plugins.classes.transform(source, fixture.page)
			assert.match(final.code, /\.p-5\s*\{/)
			assert.doesNotMatch(final.code, /\.p-4\s*\{/)
		})
	}
})

test('纯逻辑扫描途中再次保存 class，旧扫描不能复用旧入口或覆盖最新缓存', async (t) => {
	const source = (value, candidate) =>
		`<template><view class="${candidate}" /></template><script setup>const value = ${value}</script>`
	const fixture = await createFixture(t, { page: source(1, 'p-4') })
	const plugins = getPlugins(fixture.entry)
	const compilations = trackEntryCompilations(t, fixture.entry)
	await plugins.classes.transform(source(1, 'p-4'), fixture.page)
	const blocked = Promise.withResolvers()
	const resume = Promise.withResolvers()
	const read = fsPromises.readFile
	let shouldBlock = true
	const spy = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
		const content = await read(file, ...args)
		if (file === fixture.page && shouldBlock) {
			shouldBlock = false
			blocked.resolve()
			await resume.promise
		}
		return content
	})
	syncBuiltinESMExports()
	let stale = null
	try {
		await writeFile(fixture.page, source(2, 'p-4'))
		plugins.app.watchChange(fixture.page)
		stale = plugins.classes.transform(source(2, 'p-4'), fixture.page)
		await blocked.promise
		await writeFile(fixture.page, source(3, 'p-9'))
		plugins.app.watchChange(fixture.page)
		const latest = await plugins.classes.transform(source(3, 'p-9'), fixture.page)
		assert.match(latest.code, /\.p-9\s*\{/)
		assert.doesNotMatch(latest.code, /\.p-4\s*\{/)
		resume.resolve()
		await stale
		assert.equal(
			(await plugins.classes.transform(source(3, 'p-9'), fixture.page)).code,
			latest.code
		)
		assert.equal(compilations.length, 2)
	} finally {
		resume.resolve()
		await Promise.allSettled([stale])
		spy.mock.restore()
		syncBuiltinESMExports()
	}
})

test('缓存原始候选后仍响应新增主题、inline 排除与恢复', async (t) => {
	const source = '<template><view class="bg-newbrand p-4" /></template>'
	const fixture = await createFixture(t, { page: source })
	const plugins = getPlugins(fixture.entry)
	const before = await plugins.classes.transform(source, fixture.page)
	assert.doesNotMatch(before.code, /\.bg-newbrand\s*\{/)
	const entrySource = await readFile(fixture.entry, 'utf8')
	const read = fsPromises.readFile
	let pageReads = 0
	const spy = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
		if (file === fixture.page) pageReads++
		return read(file, ...args)
	})
	syncBuiltinESMExports()
	try {
		await writeFile(
			fixture.entry,
			entrySource +
				'\n@theme inline { --color-newbrand: #123456; }\n@source not inline("p-4");'
		)
		plugins.app.watchChange(fixture.entry)
		const added = await plugins.classes.transform(source, fixture.page)
		assert.match(added.code, /\.bg-newbrand\s*\{[^}]*background-color: #123456/)
		assert.doesNotMatch(added.code, /\.p-4\s*\{/)
		await writeFile(fixture.entry, entrySource)
		plugins.app.watchChange(fixture.entry)
		const restored = await plugins.classes.transform(source, fixture.page)
		assert.match(restored.code, /\.p-4\s*\{[^}]*padding:/)
		assert.doesNotMatch(restored.code, /\.bg-newbrand\s*\{/)
		assert.equal(pageReads, 0)
	} finally {
		spy.mock.restore()
		syncBuiltinESMExports()
	}
})

test('文件增删与扫描范围变化重新解析缓存依赖，并清除移出范围的候选', async (t) => {
	const source =
		'<template><view :class="value" /></template><script setup>import { value } from "./shared"</script>'
	const fixture = await createFixture(t, { page: source, sources: '@source "./*.{uvue,ts,js}";' })
	const jsFile = join(fixture.directory, 'shared.js')
	const tsFile = join(fixture.directory, 'shared.ts')
	await writeFile(jsFile, 'export const value = "p-71"')
	const plugins = getPlugins(fixture.entry)
	assert.match((await plugins.classes.transform(source, fixture.page)).code, /\.p-71\s*\{/)
	await writeFile(tsFile, 'export const value = "p-72"')
	await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match((await plugins.classes.transform(source, fixture.page)).code, /\.p-72\s*\{/)
	assert.doesNotMatch((await plugins.classes.transform(source, fixture.page)).code, /\.p-71\s*\{/)
	await rm(tsFile)
	await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match((await plugins.classes.transform(source, fixture.page)).code, /\.p-71\s*\{/)
	const entrySource = await readFile(fixture.entry, 'utf8')
	await writeFile(fixture.entry, entrySource + '\n@source not "./shared.js";')
	plugins.app.watchChange(fixture.entry)
	assert.doesNotMatch((await plugins.classes.transform(source, fixture.page)).code, /<style/)
	await writeFile(fixture.entry, entrySource)
	plugins.app.watchChange(fixture.entry)
	assert.match((await plugins.classes.transform(source, fixture.page)).code, /\.p-71\s*\{/)
})

test('局部 utility 复用入口编译片段，普通、任意值、重要号与条件规则均不再调用 Tailwind', async (t) => {
	// 比较完整语法树语义，忽略 PostCSS 在独立样式块中调整的缩进。
	function shape(node) {
		return [
			node.type,
			node.selector,
			node.name,
			node.params,
			node.prop,
			node.value,
			node.important,
			node.nodes?.filter((child) => child.type !== 'comment').map(shape)
		]
	}
	const source =
		'<template><view class="p-4 p-[17px]! bg-red-500/50 rounded-full sm:p-8 dark:p-4 animate-spin" /></template>'
	const fixture = await createFixture(t, { page: source })
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		const global = getPlugins(fixture.entry, { componentLocalStyles: false }, platform)
		const expected = await compileApp(global.app, fixture.app, fixture.directory)
		const plugins = getPlugins(fixture.entry, {}, platform)
		await compileApp(plugins.app, fixture.app, fixture.directory)
		const spy = t.mock.method(postcss.Processor.prototype, 'process', () => {
			throw new Error('局部 utility 不应触发重复编译')
		})
		let style
		try {
			const output = await plugins.classes.transform(source, fixture.page)
			style = output.code.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
			const id = `${fixture.page}?vue&type=style&index=0&lang.css`
			assert.equal(await plugins.apply.transform(style, id), null)
			assert.equal((await plugins.classes.transform('', id)).code.trim(), style.trim())
		} finally {
			spy.mock.restore()
		}
		assert.doesNotMatch(style, /@apply/)
		const expectedRules = new Set(
			postcss.parse(expected.css).nodes.map((node) => JSON.stringify(shape(node)))
		)
		for (const rule of postcss.parse(style).nodes.filter((node) => node.type !== 'comment')) {
			assert.ok(expectedRules.has(JSON.stringify(shape(rule))), `${platform}: ${rule}`)
		}
	}
})

test('直接注入的 rounded-full 仅在 Web SCSS 编译前保护，手写样式保持原样', async (t) => {
	const manual = '.manual { border-radius: calc(infinity * 1px); }'
	const source = `<template><view class="rounded-full" /></template><style lang="scss">${manual}</style>`
	const fixture = await createFixture(t, { page: source })
	const plugins = getPlugins(fixture.entry)
	const transformed = await plugins.classes.transform(source, fixture.page)
	assert.ok(transformed.code.includes(manual))
	assert.match(
		transformed.code,
		/\.rounded-full\s*\{\s*border-radius: #\{"calc\(infinity \* 1px\)"\}/
	)
	const id = `${fixture.page}?vue&type=style&index=0&lang.scss`
	const style = await plugins.classes.transform(manual, id)
	assert.ok(style.code.includes(manual))
	assert.match(style.code, /#\{"calc\(infinity \* 1px\)"\}/)
	const compiled = await plugins.classes.transform(
		`const __vite__css = ${JSON.stringify(manual)};`,
		id
	)
	const css = JSON.parse(compiled.code.match(/__vite__css = ("(?:\\.|[^"\\])*");/)[1])
	assert.doesNotMatch(css, /#\{/)
	assert.match(css, /\.rounded-full\s*\{\s*border-radius: calc\(infinity \* 1px\)/)
	assert.equal(await plugins.apply.transform(style.code, id), null)
})

test('循环成员、函数返回值和事件赋值的完整候选直接归当前文件', async (t) => {
	const source = `<template><view v-for="shape in shapes" :class="shape.className" /><view :class="getClass()" /></template>
	<script setup>
	const shapes = [{ className: 'rounded-xl' }, { className: 'rounded-full' }]
	function getClass() { return 'mt-12' }
	const state = ref('self-center')
	function confirm() { state.value = 'self-end' }
	</script>`
	const fixture = await createFixture(t, { page: source })
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const page = await plugins.classes.transform(source, fixture.page)
	for (const name of ['rounded-xl', 'rounded-full', 'mt-12', 'self-center', 'self-end']) {
		assert.ok(page.code.includes(`.${name} {`), name)
		assert.ok(!app.css.includes(`.${name} `), name)
	}
})

test('共享脚本、alias、re-export、循环依赖与动态字面量导入归每个消费者，SFC 和类型是边界', async (t) => {
	const source = `<template><view :class="shared" /></template><script setup>
	import { shared } from '@/barrel'
	import type { Shape } from './types'
	import Child from './child.uvue'
	const load = () => import('./lazy.ts')
	</script>`
	const fixture = await createFixture(t, {
		page: source,
		app: '<script setup>import "./app-classes.ts"</script>'
	})
	const second = join(fixture.directory, 'second.uvue')
	await writeFile(second, source)
	await writeFile(
		join(fixture.directory, 'barrel.ts'),
		'export { shared } from "./shared.ts"; export type { Shape } from "./types"'
	)
	await writeFile(
		join(fixture.directory, 'shared.ts'),
		'import "./barrel.ts"; export const shared = "p-17!"'
	)
	await writeFile(join(fixture.directory, 'types.ts'), 'export type Shape = "m-83"')
	await writeFile(join(fixture.directory, 'orphan.ts'), 'export const orphan = "m-84"')
	await writeFile(join(fixture.directory, 'lazy.ts'), 'export const value = "m-85"')
	await writeFile(
		join(fixture.directory, 'child.uvue'),
		'<template><view class="m-86" /></template>'
	)
	await writeFile(join(fixture.directory, 'app-classes.ts'), 'export const value = "m-87"')
	const plugins = getPlugins(fixture.entry)
	plugins.app.buildStart.call({
		resolve(specifier, importer) {
			const value = specifier.replace('@/', './')
			const name = /\.(?:ts|uvue)$/.test(value) ? value : value + '.ts'
			return { id: join(fixture.directory, name) }
		}
	})
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(app.css, /\.m-87\b/)
	assert.doesNotMatch(app.css, /\.(?:p-17-important|m-8[3-6])\b/)
	for (const file of [fixture.page, second]) {
		const transformed = await plugins.classes.transform(source, file)
		assert.match(transformed.code, /\.p-17-important\s*\{[^}]*padding:[^;]*!important/)
		assert.match(transformed.code, /\.m-85\s*\{[^}]*margin:/)
		assert.doesNotMatch(transformed.code, /\.m-8[3467]\s*\{/)
	}
})

test('局部样式保留主题依赖，公共同名手写规则不随 utility 删除', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="bg-red-500 animate-spin" /></template>',
		theme: '.bg-red-500 { outline-width: 3px; }'
	})
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(app.css, /--color-red-500:/)
	assert.match(app.css, /--animate-spin:/)
	assert.match(app.css, /\.bg-red-500\s*\{\s*outline-width: 3px/)
	assert.doesNotMatch(app.css, /\.bg-red-500\s*\{[^}]*background-color/)
	const page = await plugins.classes.transform(await readFile(fixture.page, 'utf8'), fixture.page)
	const style = page.code.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
	const compiled = (await plugins.apply.transform(
		style,
		`${fixture.page}?vue&type=style&index=0&lang.css`
	)) ?? { code: style }
	assert.match(app.css, /@keyframes spin/)
	assert.doesNotMatch(compiled.code, /@keyframes/)
	assert.match(compiled.code, /\.animate-spin/)
})

test('脚本归属遵守 Tailwind 的文件排除范围', async (t) => {
	const source =
		'<template><view class="p-4" /></template><script setup>import "./excluded.ts"</script>'
	const fixture = await createFixture(t, {
		page: source,
		sources: '@source "./*.{uvue,ts}"; @source not "./excluded.ts";'
	})
	await writeFile(join(fixture.directory, 'excluded.ts'), 'export const value = "m-91"')
	await writeFile(
		join(fixture.directory, 'other.uvue'),
		'<template><view class="m-91" /></template>'
	)
	const plugins = getPlugins(fixture.entry)
	const page = await plugins.classes.transform(source, fixture.page)
	assert.doesNotMatch(page.code, /\.m-91\s*\{/)
})

test('外链 style 不阻止追加局部工具类，script src 继承 SFC 归属', async (t) => {
	const source =
		'<template><view :class="value" /></template><script src="./classes.ts"></script><style src="./external.css"></style>'
	const fixture = await createFixture(t, { page: source })
	await writeFile(join(fixture.directory, 'classes.ts'), 'export const value = "p-27"')
	await writeFile(join(fixture.directory, 'external.css'), '.box { color: red; }')
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(app.css, /\.p-27\b/)
	const page = await plugins.classes.transform(source, fixture.page)
	assert.match(page.code, /<style src="\.\/external.css"><\/style>/)
	assert.match(page.code, /<style scoped>[\s\S]*\.p-27\s*\{[^}]*padding:/)
	const style = await plugins.classes.transform(
		'',
		`${fixture.page}?vue&type=style&index=1&lang.css`
	)
	assert.match(style.code, /\.p-27\s*\{[^}]*padding:/)
	const selfClosing = source.replace(
		'<style src="./external.css"></style>',
		'<style src="./external.css" />'
	)
	await writeFile(fixture.page, selfClosing)
	plugins.app.watchChange(fixture.page)
	const reloaded = await plugins.classes.transform(
		'',
		`${fixture.page}?vue&type=style&index=1&lang.css`
	)
	assert.match(reloaded.code, /\.p-27\s*\{[^}]*padding:/)
})

test('只有实际应用入口是全局，组件目录的同名 App.uvue 仍为局部', async (t) => {
	const fixture = await createFixture(t)
	await mkdir(join(fixture.directory, 'components'))
	const component = join(fixture.directory, 'components/App.uvue')
	const source = '<template><view class="p-39" /></template>'
	await writeFile(component, source)
	const plugins = getPlugins(fixture.entry)
	assert.doesNotMatch(
		(await compileApp(plugins.app, fixture.app, fixture.directory)).css,
		/\.p-39\b/
	)
	assert.match(
		(await plugins.classes.transform(source, component)).code,
		/\.p-39\s*\{[^}]*padding:/
	)
})

test('重复 buildStart 后纯空白更新复用 Tailwind 入口结果', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="p-4" /></template>'
	})
	const plugins = getPlugins(fixture.entry, { debug: true })
	const resolve = () => null
	plugins.app.buildStart.call({ resolve })
	await compileApp(plugins.app, fixture.app, fixture.directory)

	const messages = []
	const originalInfo = console.info
	console.info = (message) => messages.push(String(message))
	try {
		plugins.app.buildStart.call({ resolve: () => null })
		await writeFile(fixture.page, '<template> <view class="p-4" /> </template>')
		await plugins.app.handleHotUpdate({
			file: fixture.page,
			modules: [],
			server: { moduleGraph: { idToModuleMap: new Map() } }
		})
	} finally {
		console.info = originalInfo
	}
	assert.ok(
		messages.some((message) => message.includes('Tailwind entry reused')),
		messages.join('\n')
	)
	assert.equal(
		messages.some((message) => message.includes('Tailwind compile start')),
		false
	)
})

test('共享脚本 HMR 刷新全部局部消费者，删除引用后移除旧工具类', async (t) => {
	const source =
		'<template><view :class="value" /></template><script setup>import { value } from "./shared.ts"</script>'
	const fixture = await createFixture(t, { page: source })
	const second = join(fixture.directory, 'second.uvue')
	const shared = join(fixture.directory, 'shared.ts')
	await writeFile(second, source)
	await writeFile(shared, 'export const value = "p-71"')
	const plugins = getPlugins(fixture.entry)
	await compileApp(plugins.app, fixture.app, fixture.directory)
	const modules = [fixture.page, second].map((file) => ({
		id: `${file}?vue&type=style&index=0&lang.css`
	}))
	const invalidated = []
	const server = {
		moduleGraph: {
			idToModuleMap: new Map(modules.map((module) => [module.id, module])),
			getModulesByFile(file) {
				return new Set(modules.filter((module) => module.id.startsWith(file + '?')))
			},
			invalidateModule(module) {
				invalidated.push(module)
			}
		}
	}
	await writeFile(shared, 'export const value = "p-72"')
	const updated = await plugins.app.handleHotUpdate({ file: shared, modules: [], server })
	for (const module of modules) {
		assert.ok(updated.includes(module))
		assert.ok(invalidated.includes(module))
		const transformed = await plugins.classes.transform('', module.id)
		assert.match(transformed.code, /\.p-72\s*\{[^}]*padding:/)
		assert.doesNotMatch(transformed.code, /\.p-71\s*\{/)
	}
	await writeFile(fixture.page, '<template><view /></template>')
	await plugins.app.handleHotUpdate({ file: fixture.page, modules: [], server })
	const removed = await plugins.classes.transform('', modules[0].id)
	assert.equal(removed, null)
	assert.match(
		(await plugins.classes.transform('', modules[1].id)).code,
		/\.p-72\s*\{[^}]*padding:/
	)
})

test('跨端静态 v-bind 和别名 PT 均按 SFC 局部生成', async (t) => {
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		const source = `<template><app-button v-bind="alias" /></template><script setup>
		const styles = { 'text': 'text-xl!', loading: 'mr-8' }
		const options = computed<Props>(() => ({ title: 'hello/world!', pt: styles }))
		const alias = options
		</script>`
		const fixture = await createFixture(t, { page: source })
		await writeFile(join(fixture.directory, 'pages.json'), '{ "pages": [{ "path": "page" }] }')
		const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } }, platform)
		const app = await compileApp(plugins.app, fixture.app, fixture.directory)
		assert.doesNotMatch(app.css, /\.mr-8\b|\.text-xl-important\b/, platform)
		const page = await plugins.classes.transform(source, fixture.page)
		assert.match(page.code, /\.mr-8\s*\{[^}]*margin-right:/, platform)
		assert.match(page.code, /v-bind="__twBindings\(alias,/, platform)
		assert.match(page.code, /\.text-xl-important\s*\{[^}]*font-size:[^;]*!important/, platform)
		assert.match(page.code, /'text-xl!'/, platform)
		assert.match(page.code, /title: 'hello\/world!'/, platform)
		const componentFixture = await createFixture(t, { page: source })
		const componentPlugins = getPlugins(
			componentFixture.entry,
			{ customAttributes: { '*': ['pt'] } },
			platform
		)
		const shared = await compileApp(
			componentPlugins.app,
			componentFixture.app,
			componentFixture.directory
		)
		assert.doesNotMatch(shared.css, /\.mr-8\b/, platform)
		assert.doesNotMatch(shared.css, /\.text-xl-important\b/, platform)
		assert.match(
			(await componentPlugins.classes.transform(source, componentFixture.page)).code,
			/\.mr-8\s*\{[^}]*margin-right:/,
			platform
		)
	}
})

test('局部规则沿用 Tailwind 覆盖顺序，媒体条件完整保留', async (t) => {
	for (const platform of ['web', 'mp-weixin', 'mp-alipay', 'app-android']) {
		const fixture = await createFixture(t, {
			page: '<template><view class="p-8 p-4 sm:p-4 dark:p-8" /></template>'
		})
		const global = getPlugins(fixture.entry, { componentLocalStyles: false }, platform)
		const expected = await compileApp(global.app, fixture.app, fixture.directory)
		const plugins = getPlugins(fixture.entry, {}, platform)
		const app = await compileApp(plugins.app, fixture.app, fixture.directory)
		const page = await plugins.classes.transform(
			await readFile(fixture.page, 'utf8'),
			fixture.page
		)
		const style = page.code.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
		const compiled = (await plugins.apply.transform(
			style,
			`${fixture.page}?vue&type=style&index=0&lang.css`
		)) ?? { code: style }
		const names = (css) => {
			const result = []
			postcss.parse(css).walkRules((node) => {
				if (/^\.(?:p-[48]|sm-p-4|dark-p-8)$/.test(node.selector)) result.push(node.selector)
			})
			return result
		}
		assert.deepEqual(names(compiled.code), names(expected.css), platform)
		assert.doesNotMatch(app.css, /\.p-[48]\s*\{/, platform)
		if (!platform.startsWith('app')) {
			assert.match(compiled.code, /@media[^}]*\.sm-p-4\s*\{[^}]*padding:/, platform)
			assert.match(compiled.code, /@media[^}]*\.dark-p-8\s*\{[^}]*padding:/, platform)
		}
	}
})

test('仅 @apply 不生成独立 utility，局部、全局和嵌套 inline 按实际使用保留', async (t) => {
	const fixture = await createFixture(t, {
		inline: '@source inline("p-{4,{8,12}} m-{2..10..2} max-w-102");',
		page: `<template><view class="p-8 m-6 m-7 max-w-101" /></template><style>.box { @apply max-w-100 max-w-101 max-w-102; }</style>`
	})
	await writeFile(join(fixture.directory, 'global.ts'), "const value = 'max-w-102'")
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(app.css, /\.max-w-100\b|\.max-w-101\b|\.m-7\b/)
	for (const name of ['p-4', 'p-8', 'p-12', 'm-6', 'max-w-102'])
		assert.ok(app.css.includes(`.${name} `), name)
	const page = await plugins.classes.transform(await readFile(fixture.page, 'utf8'), fixture.page)
	assert.match(page.code, /\.max-w-101\s*\{[^}]*max-width:/)
	assert.doesNotMatch(page.code, /\.max-w-100\s*\{/)
	const globalPlugins = getPlugins(fixture.entry, { componentLocalStyles: false })
	const global = await compileApp(globalPlugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(global.css, /\.max-w-100\b/)
	assert.match(global.css, /\.max-w-101\b/)
})

test('关闭局部样式仍检测不同 utility 的安全类名碰撞', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="bg-[url(a/b.png)] bg-[url(a-b.png)]" /></template>'
	})
	for (const componentLocalStyles of [true, false]) {
		const plugins = getPlugins(fixture.entry, { componentLocalStyles })
		await assert.rejects(compileApp(plugins.app, fixture.app, fixture.directory), /类名碰撞/)
	}
})

test('自定义 dark 选择器完整局部化，不把条件选择器 dark 当作 utility', async (t) => {
	const fixture = await createFixture(t, {
		theme: '@custom-variant dark (&:where(.dark, .dark *));',
		page: '<template><view class="dark dark:p-8" /></template>'
	})
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const page = await plugins.classes.transform(await readFile(fixture.page, 'utf8'), fixture.page)
	assert.match(page.code, /\.dark-p-8:where\(\.dark, \.dark \*\)\s*\{[^}]*padding:/)
	assert.doesNotMatch(page.code, /\.dark\s*\{/)
	assert.doesNotMatch(app.css, /\.dark-p-8/)
})

async function createFixture(t, options = {}) {
	const directory = await mkdtemp(join(tmpdir(), 'tailwind-local-styles-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const entry = join(directory, 'tailwind.css')
	const app = join(directory, 'App.uvue')
	const page = join(directory, 'page.uvue')
	const customCss = join(directory, 'custom.css')
	const tailwind = require.resolve('tailwindcss/index.css').replace(/\\/g, '/')
	if (options.customCss) {
		await writeFile(customCss, '.skin-green { --skin-color: #00aa88; }')
	}
	await writeFile(
		entry,
		`@import ${JSON.stringify(tailwind)} source(none);\n${options.customCss ? "@import './custom.css';" : ''}\n${options.theme ?? ''}\n${options.inline ?? ''}\n${options.sources ?? "@source './**/*.{uvue,ts,uts}';"}`
	)
	await writeFile(app, options.app ?? '<template><view /></template>')
	await writeFile(page, options.page ?? '<template><view class="bg-red-500" /></template>')
	return { directory, entry, app, page }
}

function getPlugins(entry, options = {}, platform = 'web') {
	const previousPlatform = process.env.UNI_PLATFORM
	process.env.UNI_PLATFORM = platform
	let plugins
	try {
		plugins = uniAppXTailwind({ entry, ...options })
	} finally {
		if (previousPlatform == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previousPlatform
	}
	return {
		all: plugins,
		classes: plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class'),
		app: plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style'),
		apply: plugins.find((plugin) => plugin.name === 'uniappx-tailwind-apply-fallback')
	}
}

async function compileApp(plugin, appFile, directory) {
	const id = `${appFile}?vue&type=style&index=0&lang.css`
	const result = await plugin.transform.call(
		{ addWatchFile() {} },
		"@import './tailwind.css';",
		id
	)
	return { css: result.code, id, directory }
}

test('自定义属性候选按文件局部生成，公共手写 CSS 与 inline 保留全局', async (t) => {
	const fixture = await createFixture(t, {
		inline: '@source inline("bg-blue-500");',
		page: `<template>
			<view class="bg-red-500" hover-class="bg-blue-500" customClass="p-4" paletteClass="m-4" data-class="text-green-500" />
			<app-input :pt="{ root: 'border-[#000000]' }" />
			<x-special tone="border-[#000000]" />
			<view :class="skinName" />
			<view :unknown-class="'text-yellow-500'" />
		</template>
		<script setup>const skinName = 'skin-green'</script>
		<style scoped>.local { @apply items-center; }</style>`,
		customCss: true
	})
	const plugins = getPlugins(fixture.entry, {
		customAttributes: {
			'*': ['customClass', /Class$/, 'pt'],
			'x-special': ['tone'],
			'view': ['data-class']
		}
	})
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const transformed = (await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)) ?? { code: await readFile(fixture.page, 'utf8') }

	assert.doesNotMatch(app.css, /\.bg-red-500\b/)
	assert.match(app.css, /\.bg-blue-500\b/)
	assert.doesNotMatch(app.css, /\.p-4\b/)
	assert.doesNotMatch(app.css, /\.m-4\b/)
	assert.doesNotMatch(app.css, /\.text-green-500\b/)
	assert.doesNotMatch(app.css, /\.border-000000\b/)
	assert.doesNotMatch(app.css, /\.text-yellow-500\b/)
	assert.match(app.css, /\.skin-green\s*\{\s*--skin-color: #00aa88/)
	assert.match(transformed.code, /class="bg-red-500"/)
	assert.match(transformed.code, /hover-class="bg-blue-500"/)
	assert.match(transformed.code, /customClass="p-4"/)
	assert.match(transformed.code, /paletteClass="m-4"/)
	assert.match(transformed.code, /data-class="text-green-500"/)
	assert.match(transformed.code, /:pt="\{ root: 'border-000000' \}"/)
	assert.match(transformed.code, /tone="border-000000"/)
	assert.doesNotMatch(transformed.code, /tu-[a-f0-9]{16}/)
	assert.match(transformed.code, /:unknown-class="'text-yellow-500'"/)
	assert.match(transformed.code, /:class="__twClass\(skinName\)"/)
	assert.doesNotMatch(transformed.code, /\.skin-green\s*\{/)
	assert.equal([...transformed.code.matchAll(/<style\b/g)].length, 1)
	assert.match(
		transformed.code,
		/<style scoped>\.local \{ @apply items-center; \}[\s\S]*Tailwind 局部工具类/
	)
	const localStyle = [...transformed.code.matchAll(/<style scoped>([\s\S]*?)<\/style>/g)].at(
		-1
	)?.[1]
	assert.ok(localStyle)
	assert.match(localStyle, /\.border-000000\s*\{[^}]*border-color: #000000/)
	assert.match(localStyle, /\.bg-blue-500\s*\{[^}]*background-color:/)
	assert.equal([...localStyle.matchAll(/@apply items-center/g)].length, 1)
	const styleId = `${fixture.page}?vue&type=style&index=1&lang.css`
	const reference = plugins.all.find((plugin) => plugin.name === 'uniappx-tailwind-reference')
	const referenced = reference.transform(localStyle, styleId)
	const compiledStyle = (await plugins.apply.transform(
		referenced?.code ?? localStyle,
		styleId
	)) ?? { code: localStyle }
	assert.match(compiledStyle.code, /\.bg-red-500\s*\{[^}]*background-color: var\(/)
	assert.match(compiledStyle.code, /\.border-000000\s*\{[^}]*border-color: #000000/)
})

test('PT 与普通 class 共享变量时局部生成，保持重要号', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view :class="iconClass" /><app-button :pt="{ icon: iconClass }" /></template>
		<script setup>const iconClass = 'text-2xl!'</script>`
	})
	const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } })
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(app.css, /\.text-2xl-important\b/)
	const transformed = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)
	const style = transformed.code.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
	const compiled = (await plugins.apply.transform(
		style,
		`${fixture.page}?vue&type=style&index=0&lang.css`
	)) ?? { code: style }
	assert.match(compiled.code, /\.text-2xl-important\s*\{[^}]*font-size:[^;]*!important/)
})

test('主包、分包页面与组件采用相同的局部 PT 规则', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><app-button :pt="{ loading: 'mr-8', text: 'font-bold' }" /></template>`
	})
	const component = join(fixture.directory, 'component.uvue')
	await writeFile(component, `<template><app-button :pt="{ icon: 'text-2xl!' }" /></template>`)
	const pagesFile = join(fixture.directory, 'pages.json')
	for (const routes of [
		'{ "pages": [{ "path": "page" }] }',
		`{ // 分包路径以项目目录为基准
			"pages": [],
			"subPackages": [{ "root": ".", "pages": [{ "path": "page", }], }],
		}`
	]) {
		await writeFile(pagesFile, routes)
		const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } })
		const app = await compileApp(plugins.app, fixture.app, fixture.directory)
		assert.doesNotMatch(app.css, /\.mr-8\b/)
		assert.doesNotMatch(app.css, /\.text-2xl-important\b/)
		const page = await plugins.classes.transform(
			await readFile(fixture.page, 'utf8'),
			fixture.page
		)
		assert.match(page.code, /\.mr-8\s*\{[^}]*margin-right:/)
		assert.match(page.code, /\.font-bold\s*\{[^}]*font-weight:/)
	}
})

test('路由变化不再改变同一 SFC 的工具类归属', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><app-button :pt="{ loading: 'mr-8' }" /></template>`
	})
	const pagesFile = join(fixture.directory, 'pages.json')
	await writeFile(pagesFile, '{ "pages": [] }')
	const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } })
	assert.doesNotMatch(
		(await compileApp(plugins.app, fixture.app, fixture.directory)).css,
		/\.mr-8\b/
	)
	const styleModule = { id: `${fixture.page}?vue&type=style&index=0&lang.css` }
	for (const registered of [true, false]) {
		await writeFile(pagesFile, JSON.stringify({ pages: registered ? [{ path: 'page' }] : [] }))
		const invalidated = []
		const updated = await plugins.app.handleHotUpdate({
			file: pagesFile,
			modules: [],
			server: {
				moduleGraph: {
					idToModuleMap: new Map([[styleModule.id, styleModule]]),
					invalidateModule(module) {
						invalidated.push(module)
					}
				}
			}
		})
		assert.equal(updated, undefined)
		assert.deepEqual(invalidated, [])
		const app = await compileApp(plugins.app, fixture.app, fixture.directory)
		assert.doesNotMatch(app.css, /\.mr-8\b/)
	}
})

test('Web 页面归属使用 Vite root，支持真实分包和同类名的页面、组件共用', async (t) => {
	const fixture = await createFixture(t)
	await mkdir(join(fixture.directory, 'feature'))
	await mkdir(join(fixture.directory, 'styles'))
	const entry = join(fixture.directory, 'styles/tailwind.css')
	await writeFile(entry, `@import '../tailwind.css';`)
	await writeFile(
		join(fixture.directory, 'pages.json'),
		'{ "pages": [], "subpackages": [{ "root": "feature", "pages": [{ "path": "index" }] }] }'
	)
	const page = join(fixture.directory, 'feature/index.uvue')
	const component = join(fixture.directory, 'feature/widget.uvue')
	const source = `<template><app-button :pt="{ loading: 'mr-8' }" /></template>`
	await writeFile(page, source)
	await writeFile(component, source)
	const plugins = getPlugins(entry, { customAttributes: { '*': ['pt'] } })
	plugins.app.configResolved({ root: fixture.directory, build: { outDir: 'dist' } })
	const app = await plugins.app.transform(
		"@import './styles/tailwind.css';",
		`${fixture.app}?vue&type=style&index=0&lang.css`
	)
	assert.doesNotMatch(app.code, /\.mr-8\b/)
	assert.match(
		(await plugins.classes.transform(source, page)).code,
		/\.mr-8\s*\{[^}]*margin-right:/
	)
	assert.match(
		(await plugins.classes.transform(source, component)).code,
		/\.mr-8\s*\{[^}]*margin-right:/
	)
})

test('Web HMR 在普通 class 与 PT 间切换时保持局部归属', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="text-2xl!" /></template>'
	})
	const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } })
	for (const external of [false, true, false]) {
		await writeFile(
			fixture.page,
			external
				? `<template><app-button :pt="{ icon: 'text-2xl!' }" /></template>`
				: '<template><view class="text-2xl!" /></template>'
		)
		plugins.app.watchChange(fixture.page)
		const app = await compileApp(plugins.app, fixture.app, fixture.directory)
		assert.doesNotMatch(app.css, /\.text-2xl-important\s*\{/)
	}
})

test('App 明确使用的候选保留全局，未引用脚本不引入隐式全局', async (t) => {
	const fixture = await createFixture(t, {
		app: '<template><view class="text-red-500" /></template>',
		page: '<template><view class="text-red-500 p-4" /></template>'
	})
	await writeFile(join(fixture.directory, 'shared.ts'), 'const shared = "p-4"')
	await writeFile(join(fixture.directory, 'shared.uts'), 'const shared = "p-4"')
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const transformed = (await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)) ?? { code: await readFile(fixture.page, 'utf8') }

	assert.match(app.css, /\.text-red-500\b/)
	assert.doesNotMatch(app.css, /\.p-4\b/)
	assert.match(transformed.code, /class="text-red-500 p-4"/)
	assert.match(transformed.code, /\.text-red-500\s*\{[^}]*color:/)
	assert.match(transformed.code, /\.p-4\s*\{[^}]*padding:/)
})

test('App 的 PT 局部工具类复用全局主题变量，主题 oklch 转换为 rgb', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><app-slider :pt="{ track: 'bg-neutral-600' }" /></template>`
	})
	await writeFile(join(fixture.directory, 'pages.json'), '{ "pages": [{ "path": "page" }] }')
	const plugins = getPlugins(fixture.entry, { customAttributes: { '*': ['pt'] } }, 'app-android')
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(app.css, /--color-neutral-600:\s*rgb\(82,82,82\)/)
	const source = await readFile(fixture.page, 'utf8')
	const transformed = await plugins.classes.transform(source, fixture.page)
	const localStyle = transformed.code.match(/<style>([\s\S]*?)<\/style>/)?.[1]
	assert.ok(localStyle)
	const styleId = `${fixture.page}?vue&type=style&index=0&lang.css`
	const reference = plugins.all.find((plugin) => plugin.name === 'uniappx-tailwind-reference')
	const referenced = reference.transform(localStyle, styleId)
	const compiledStyle = (await plugins.apply.transform(
		referenced?.code ?? localStyle,
		styleId
	)) ?? { code: localStyle }

	assert.match(
		compiledStyle.code,
		/\.bg-neutral-600\s*\{[^}]*background-color:\s*var\(--color-neutral-600\)/
	)
	assert.doesNotMatch(compiledStyle.code, /oklch/)
})

test('main.ts 全局配置通过公共 inline 显式声明', async (t) => {
	const fixture = await createFixture(t, {
		sources: "@source './App.uvue';\n@source './main.ts';\n@source './page.uvue';"
	})
	await writeFile(
		join(fixture.directory, 'main.ts'),
		"const props = { root: 'mt-12 mx-12 mb-20' }"
	)
	const plugins = getPlugins(fixture.entry)
	const before = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(before.css, /\.(?:mt-12|mx-12|mb-20)\b/)
	await writeFile(
		fixture.entry,
		(await readFile(fixture.entry, 'utf8')) + '\n@source inline("mt-12 mx-12 mb-20");'
	)
	plugins.app.watchChange(fixture.entry)
	const after = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(after.css, /\.mt-12\b/)
	assert.match(after.css, /\.mx-12\b/)
	assert.match(after.css, /\.mb-20\b/)
})

test('App 局部 @apply 透明度使用全局注入的主题 RGB 通道', async (t) => {
	const fixture = await createFixture(t, {
		theme: 'page { --app-primary: #1677ff; }\n@theme inline { --color-primary: var(--app-primary); }',
		page: '<template><view class="bg-primary/50" /></template>',
		sources: "@source './App.uvue';\n@source './page.uvue';"
	})
	const colorVariables = [/^--app-[\w-]+$/]
	const plugins = getPlugins(fixture.entry, { colorVariables }, 'app-android')
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const local = await plugins.apply.transform(
		'.bg-primary-50 { @apply bg-primary/50; }',
		`${fixture.page}?vue&type=style&index=0&lang.css`
	)

	assert.match(app.css, /--app-primary-rgb:\s*22,119,255/)
	assert.match(local.code, /background-color:\s*rgba\(var\(--app-primary-rgb\),0\.5\)/)
	assert.doesNotMatch(local.code, /color-mix|@supports/)
})

test('多个局部文件复用安全类名且不输出全局规则', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="p-4" /></template>'
	})
	const secondPage = join(fixture.directory, 'second.uvue')
	await writeFile(secondPage, '<template><view class="p-4" /></template>')
	const plugins = getPlugins(fixture.entry)
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const first = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)
	const second = await plugins.classes.transform(await readFile(secondPage, 'utf8'), secondPage)

	assert.doesNotMatch(app.css, /\.p-4\b/)
	assert.match(first.code, /class="p-4"/)
	assert.match(second.code, /class="p-4"/)
	assert.match(first.code, /\.p-4\s*\{[^}]*padding:/)
	assert.match(second.code, /\.p-4\s*\{[^}]*padding:/)
})

test('Web 将局部 utility 追加到已有样式块，避免额外 style 模块', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view class="mt-12" /></template>
		<style lang="scss">.custom { color: red; }</style>
		<style>.later { color: green; }</style>
		<style module>.hashed { color: blue; }</style>`
	})
	const plugins = getPlugins(fixture.entry)
	const transformed = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)

	assert.equal([...transformed.code.matchAll(/<style\b/g)].length, 3)
	assert.match(transformed.code, /<style lang="scss">\.custom \{ color: red; \}<\/style>/)
	assert.match(
		transformed.code,
		/<style>\.later \{ color: green; \}\s*\/\* Tailwind 局部工具类 \*\/\s*\.mt-12\s*\{\s*margin-top:[^}]+\}\s*<\/style>/
	)
	assert.match(transformed.code, /<style module>\.hashed \{ color: blue; \}<\/style>/)
	assert.doesNotMatch(transformed.code, /<style scoped>/)
})

test('原生平台不生成 scoped style，并为局部 utility 追加普通 style', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view class="p-4" /></template>
		<style scoped>.existing { color: red; }</style>`
	})
	const plugins = getPlugins(fixture.entry, {}, 'app-android')
	const transformed = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)

	assert.match(transformed.code, /<style scoped>\.existing \{ color: red; \}<\/style>/)
	assert.match(
		transformed.code,
		/<style>\s*\/\* Tailwind 局部工具类 \*\/\s*\.p-4\s*\{\s*padding:[^}]+\}\s*<\/style>/
	)
	assert.equal([...transformed.code.matchAll(/<style\b/g)].length, 2)
})

test('Web 局部 style 转换可重复执行且不会再次追加规则', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="mt-12" /></template>'
	})
	const plugins = getPlugins(fixture.entry)
	const source = await readFile(fixture.page, 'utf8')
	const first = await plugins.classes.transform(source, fixture.page)
	const secondResult = await plugins.classes.transform(first.code, fixture.page)
	const second = secondResult?.code ?? first.code

	assert.equal(second, first.code)
	assert.equal([...second.matchAll(/Tailwind 局部工具类/g)].length, 1)
	assert.match(second, /<style scoped>/)
})

test('componentLocalStyles=false 保留全局 CSS 并且不改写页面 class', async (t) => {
	const fixture = await createFixture(t)
	const plugins = getPlugins(fixture.entry, { componentLocalStyles: false })
	const app = await compileApp(plugins.app, fixture.app, fixture.directory)
	const transformed = (await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)) ?? { code: await readFile(fixture.page, 'utf8') }

	assert.match(app.css, /\.bg-red-500\b/)
	assert.match(transformed.code, /class="bg-red-500"/)
	assert.doesNotMatch(transformed.code, /<style scoped>/)
})

test('不向 Vue 虚拟脚本模块追加局部 style 块', async (t) => {
	const fixture = await createFixture(t)
	const plugins = getPlugins(fixture.entry)
	const virtualModules = [
		[`${fixture.page}?vue&type=script&setup=true&lang.ts`, "const styles = ['bg-red-500']"],
		[`${fixture.page}?vue&type=template&id=abcd`, '<view class="bg-red-500" />']
	]
	for (const [id, code] of virtualModules) {
		assert.equal(await plugins.classes.transform(code, id), null)
	}
})

test('HMR 中候选新增全局归属后重新加入 App CSS', async (t) => {
	const fixture = await createFixture(t)
	const plugins = getPlugins(fixture.entry)
	const appStyleId = `${fixture.app}?vue&type=style&index=0&lang.css`
	const appModule = { id: appStyleId }
	const first = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.doesNotMatch(first.css, /\.bg-red-500\b/)

	await writeFile(fixture.app, '<template><view class="bg-red-500" /></template>')
	await plugins.app.handleHotUpdate({
		file: fixture.app,
		modules: [],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([[appStyleId, appModule]]),
				invalidateModule() {}
			}
		}
	})
	const second = await compileApp(plugins.app, fixture.app, fixture.directory)
	assert.match(second.css, /\.bg-red-500\b/)
})

test('HMR 明确失效页面的局部 style 虚拟模块', async (t) => {
	const fixture = await createFixture(t)
	const plugins = getPlugins(fixture.entry)
	const appStyleId = `${fixture.app}?vue&type=style&index=0&lang.css`
	const pageStyleId = `${fixture.page}?vue&type=style&index=0&scoped=abc123&lang.css`
	const appStyleModule = { id: appStyleId }
	const pageModule = { id: fixture.page }
	const pageStyleModule = { id: pageStyleId }
	await compileApp(plugins.app, fixture.app, fixture.directory)
	const invalidated = []
	const result = await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [pageModule],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([
					[appStyleId, appStyleModule],
					[pageStyleId, pageStyleModule]
				]),
				getModulesByFile(file) {
					assert.equal(file, fixture.page)
					return new Set([pageModule, pageStyleModule])
				},
				invalidateModule(module) {
					invalidated.push(module)
				}
			}
		}
	})

	assert.deepEqual(invalidated, [pageStyleModule, appStyleModule])
	assert.deepEqual(result, [pageModule, pageStyleModule, appStyleModule])
})

test('同一源码连续触发 HMR 时只返回最后一轮更新', async (t) => {
	const fixture = await createFixture(t)
	const plugins = getPlugins(fixture.entry)
	await compileApp(plugins.app, fixture.app, fixture.directory)
	const appStyle = { id: `${fixture.app}?vue&type=style&index=0&lang.css` }
	const createContext = () => ({
		file: fixture.page,
		modules: [],
		server: {
			moduleGraph: {
				idToModuleMap: new Map([[appStyle.id, appStyle]]),
				invalidateModule() {}
			}
		}
	})
	const first = plugins.app.handleHotUpdate(createContext())
	await new Promise((resolve) => setTimeout(resolve, 20))
	const second = plugins.app.handleHotUpdate(createContext())

	assert.deepEqual(await first, [])
	assert.ok((await second).some((module) => module.id?.includes('App.uvue?vue&type=style')))
})

test('HMR 修改透明度候选后重建页面局部规则', async (t) => {
	const fixture = await createFixture(t, {
		page: '<template><view class="bg-red-500/10" /></template>'
	})
	const plugins = getPlugins(fixture.entry)
	await compileApp(plugins.app, fixture.app, fixture.directory)
	const initial = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)
	assert.match(initial.code, /\.bg-red-500-10\s*\{[^}]*background-color:/)

	await writeFile(fixture.page, '<template><view class="bg-red-500/50" /></template>')
	await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [],
		server: { moduleGraph: { idToModuleMap: new Map(), invalidateModule() {} } }
	})
	const updated = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		fixture.page
	)

	assert.match(updated.code, /\.bg-red-500-50\s*\{[^}]*background-color:/)
	assert.doesNotMatch(updated.code, /\.bg-red-500-10 \{/)
})

test('HMR 替换模板 utility 后更新已加载的页面 style 模块', async (t) => {
	const fixture = await createFixture(t, {
		theme: '@theme { --color-primary: #345678; --spacing: 0.25rem; }',
		page: '<template><view class="bg-primary/10 p-8" /></template><style lang="scss">.panel { color: red; }</style>'
	})
	const plugins = getPlugins(fixture.entry)
	const styleId = `${fixture.page}?vue&type=style&index=0&scoped=abc123&lang.scss`
	const styleModule = { id: styleId }
	let styleModuleCode =
		'const __vite__css = ".panel { color: red; }"; export default __vite__css;'
	const compileStyleModule = async () => {
		const transformed = await plugins.classes.transform(styleModuleCode, styleId)
		assert.ok(transformed)
		styleModuleCode = transformed.code
		const reference = plugins.all.find((plugin) => plugin.name === 'uniappx-tailwind-reference')
		const cssValue = transformed.code.match(/__vite__css = ("(?:\\.|[^"\\])*");/)?.[1]
		assert.ok(cssValue)
		const css = JSON.parse(cssValue)
		const referenced = reference.transform(css, styleId)
		const referencedCss = referenced?.code ?? css
		const compiled = await plugins.apply.transform(referencedCss, styleId)
		return compiled?.code ?? referencedCss
	}
	await compileApp(plugins.app, fixture.app, fixture.directory)
	const initial = await compileStyleModule()
	assert.match(initial, /background-color: color-mix\(in srgb, #345678 10%, transparent\)/)
	assert.match(initial, /color-mix\(in oklab, var\(--color-primary\) 10%, transparent\)/)
	assert.match(initial, /padding: calc\(var\(--spacing\) \* 8\)/)

	await writeFile(
		fixture.page,
		'<template><view class="bg-primary/90 p-81" /></template><style lang="scss">.panel { color: red; }</style>'
	)
	const invalidated = []
	const result = await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [{ id: fixture.page }],
		server: {
			moduleGraph: {
				idToModuleMap: new Map(),
				getModulesByFile(file) {
					assert.equal(file, fixture.page)
					return new Set([{ id: fixture.page }, styleModule])
				},
				invalidateModule(module) {
					invalidated.push(module)
				}
			}
		}
	})
	const updated = await compileStyleModule()

	assert.deepEqual(invalidated, [styleModule])
	assert.ok(result.includes(styleModule))
	assert.match(updated, /background-color: color-mix\(in srgb, #345678 90%, transparent\)/)
	assert.match(updated, /color-mix\(in oklab, var\(--color-primary\) 90%, transparent\)/)
	assert.match(updated, /padding: calc\(var\(--spacing\) \* 81\)/)
	assert.doesNotMatch(updated, /10%, transparent/)
	assert.doesNotMatch(updated, /\* 8\)/)

	await writeFile(
		fixture.page,
		'<template><view class="plain" /></template><style lang="scss">.panel { color: red; }</style>'
	)
	await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [],
		server: { moduleGraph: { idToModuleMap: new Map(), invalidateModule() {} } }
	})
	const removed = await compileStyleModule()
	assert.match(removed, /\.panel\s*\{\s*color: red;\s*\}/)
	assert.doesNotMatch(removed, /Tailwind 局部工具类|bg-primary-90|\.p-81/)
})

test('HMR 从页面 @apply 删除任意渐变后保留其余页面样式', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view class="relative h-68 rounded-lg overflow-hidden p-4" /></template>
		<style lang="scss">
		.gradient { @apply absolute left-0 top-0 right-0 bottom-0 bg-[linear-gradient(to_right,#a0aeeb,#6a977a)]; }
		</style>`
	})
	const plugins = getPlugins(fixture.entry)
	const reference = plugins.all.find((plugin) => plugin.name === 'uniappx-tailwind-reference')
	const apply = plugins.apply
	const styleId = `${fixture.page}?vue&type=style&index=0&lang.scss`
	const compilePageStyle = async () => {
		const source = await readFile(fixture.page, 'utf8')
		const transformed = await plugins.classes.transform(source, fixture.page)
		const style = transformed.code.match(/<style lang="scss">([\s\S]*?)<\/style>/)?.[1]
		assert.ok(style)
		const referenced = reference.transform(style, styleId)
		return apply.transform(referenced.code, styleId)
	}

	const initial = await compilePageStyle()
	assert.match(initial.code, /linear-gradient\(to right,#a0aeeb,#6a977a\)/)
	assert.match(initial.code, /position: absolute/)

	await writeFile(
		fixture.page,
		`<template><view class="relative h-68 rounded-lg overflow-hidden p-4" /></template>
		<style lang="scss">
		.gradient { @apply absolute left-0 top-0 right-0 bottom-0; }
		</style>`
	)
	await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [],
		server: { moduleGraph: { idToModuleMap: new Map(), invalidateModule() {} } }
	})
	const updated = await compilePageStyle()

	assert.doesNotMatch(updated.code, /linear-gradient\(/)
	assert.match(updated.code, /position: absolute/)
	assert.match(updated.code, /\.p-4\s*\{\s*padding: calc\(/)
})

test('页面 style 虚拟模块 HMR 时补回模板的局部 utility', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view class="p-4 rounded-lg" /></template>
		<style lang="scss">.gradient { @apply absolute bg-[linear-gradient(to_right,#a0aeeb,#6a977a)]; }</style>`
	})
	const plugins = getPlugins(fixture.entry)
	const styleId = `${fixture.page}?vue&type=style&index=0&scoped=abc123&lang.scss`
	const compileStyleModule = (code) => plugins.classes.transform(code, styleId)

	const initial = await compileStyleModule(
		'.gradient { @apply absolute bg-[linear-gradient(to_right,#a0aeeb,#6a977a)]; }'
	)
	assert.match(initial.code, /\.p-4\s*\{\s*padding:[^}]+\}/)
	assert.match(initial.code, /\.rounded-lg\s*\{[^}]*border-radius:/)

	await writeFile(
		fixture.page,
		'<template><view class="p-4 rounded-lg" /></template><style lang="scss">.gradient { @apply absolute; }</style>'
	)
	await plugins.app.handleHotUpdate({
		file: fixture.page,
		modules: [],
		server: { moduleGraph: { idToModuleMap: new Map(), invalidateModule() {} } }
	})
	const updated = await compileStyleModule('.gradient { @apply absolute; }')

	assert.match(updated.code, /\.p-4\s*\{\s*padding:[^}]+\}/)
	assert.match(updated.code, /\.rounded-lg\s*\{[^}]*border-radius:/)
	assert.doesNotMatch(updated.code, /linear-gradient\(/)
})

test('style query 收到完整 SFC 时不把模板和脚本当作 CSS', async (t) => {
	const fixture = await createFixture(t, {
		page: `<template><view class="p-4" /></template>
		<script setup>const value = ref(1)</script>
		<style lang="scss">.panel { @apply p-4; }</style>`
	})
	const plugins = getPlugins(fixture.entry)
	const result = await plugins.classes.transform(
		await readFile(fixture.page, 'utf8'),
		`${fixture.page}?vue&type=style&index=0&lang.scss`
	)

	assert.equal(result, null)
})
