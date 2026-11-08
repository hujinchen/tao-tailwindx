import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { uniAppXTailwind } from '../src/index.mjs'

function themePlugin(input, output) {
	const plugin = uniAppXTailwind({ themeValues: { input, output } }).find(
		(plugin) => plugin.name === 'uniappx-tailwind-theme-values'
	)
	assert.ok(plugin, '启用 themeValues 后应注册数据导出插件')
	return plugin
}

async function readValues(output) {
	const code = stripTypeScriptTypes(readFileSync(output, 'utf8'))
	return (await import(`data:text/javascript,${encodeURIComponent(code)}`)).themeValues
}

test('可选主题导出保留原选择器、明暗条件和字符串值，产物可以独立导入', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'tailwind-theme-data-'))
	try {
		const input = join(directory, 'theme.css')
		const output = join(directory, 'theme-values.ts')
		writeFileSync(
			input,
			`
			:root, page { --brand: #1677ff; --spacing: 4px; color: red; }
			.palette-green { --brand: #2dc8a1; --label: "涛哥's\\\\skin"; }
			@media (prefers-color-scheme: light) { page { --spacing: 8px; } }
			@media (prefers-color-scheme: dark) {
				page { --brand: #3d8fff; }
				.palette-green { --brand: #3dd5b1; }
			}
		`
		)
		const plugin = themePlugin(input, output)
		assert.equal(existsSync(output), false)
		plugin.configResolved()
		assert.deepEqual(
			[...(await readValues(output))],
			[
				['light::root:--brand', '#1677ff'],
				['light::root:--spacing', '4px'],
				['light:page:--brand', '#1677ff'],
				['light:page:--spacing', '8px'],
				['light:.palette-green:--brand', '#2dc8a1'],
				['light:.palette-green:--label', '"涛哥\'s\\\\skin"'],
				['dark:page:--brand', '#3d8fff'],
				['dark:.palette-green:--brand', '#3dd5b1']
			]
		)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})

test('主题导出在构建前刷新、注册输入监听且相同内容不重复写入', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'tailwind-theme-lifecycle-'))
	try {
		const input = join(directory, 'theme.css')
		const output = join(directory, 'generated/theme-values.ts')
		const plugin = themePlugin(input, output)
		writeFileSync(input, 'page { --brand: #1677ff; }')
		plugin.configResolved()
		assert.equal((await readValues(output)).get('light:page:--brand'), '#1677ff')
		const timestamp = statSync(output, { bigint: true }).mtimeNs
		const watched = []
		plugin.buildStart.handler.call({ addWatchFile: (file) => watched.push(file) })
		assert.deepEqual(watched, [input])
		assert.equal(statSync(output, { bigint: true }).mtimeNs, timestamp)
		writeFileSync(input, 'page { --brand: #123456; }')
		plugin.buildStart.handler.call({ addWatchFile() {} })
		assert.equal((await readValues(output)).get('light:page:--brand'), '#123456')
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})

test('主题输入按顺序覆盖，watch 和 HMR 移除旧变量并忽略无关文件', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'tailwind-theme-watch-'))
	try {
		const input = join(directory, 'theme.css')
		const skin = join(directory, 'skin.css')
		const output = join(directory, 'theme-values.ts')
		writeFileSync(input, 'page { --brand: #1677ff; --text: #111111; }')
		writeFileSync(skin, 'page { --brand: #123456; } .custom { --brand: #abcdef; }')
		const plugin = themePlugin([input, skin], output)
		plugin.configResolved()
		assert.equal((await readValues(output)).get('light:page:--brand'), '#123456')
		assert.equal((await readValues(output)).get('light:page:--text'), '#111111')
		writeFileSync(skin, '.custom { --brand: #222222; }')
		plugin.watchChange(join(directory, 'unrelated.css'))
		assert.equal((await readValues(output)).get('light:.custom:--brand'), '#abcdef')
		plugin.watchChange(skin)
		assert.equal((await readValues(output)).get('light:page:--brand'), '#1677ff')
		assert.equal((await readValues(output)).get('light:.custom:--brand'), '#222222')
		writeFileSync(skin, '')
		plugin.handleHotUpdate({ file: skin })
		assert.equal((await readValues(output)).has('light:.custom:--brand'), false)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})

test('主题导出拒绝空配置和覆盖输入文件', () => {
	for (const themeValues of [
		{ input: [], output: '/tmp/theme.ts' },
		{ input: '', output: '/tmp/theme.ts' },
		{ input: '/tmp/theme.css', output: '' },
		{ input: '/tmp/theme.css', output: '/tmp/theme.css' }
	]) {
		assert.throws(() => uniAppXTailwind({ themeValues }), /themeValues/)
	}
})

test('主题导出拒绝无法表达的条件和空变量，失败时保留已有产物', () => {
	const directory = mkdtempSync(join(tmpdir(), 'tailwind-theme-invalid-'))
	try {
		const input = join(directory, 'theme.css')
		const output = join(directory, 'theme-values.ts')
		writeFileSync(output, 'existing output')
		const plugin = themePlugin(input, output)
		for (const css of [
			'page { --brand: ; }',
			'@media (min-width: 600px) { page { --brand: #fff; } }',
			'@supports (display: grid) { page { --brand: #fff; } }'
		]) {
			writeFileSync(input, css)
			assert.throws(() => plugin.configResolved(), /主题变量/)
			assert.equal(readFileSync(output, 'utf8'), 'existing output')
		}
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})

test('未配置主题导出时不注册生成器，自定义 class 属性仍按显式配置转换', () => {
	const defaults = uniAppXTailwind()
	assert.ok(!defaults.some((plugin) => plugin.name === 'uniappx-tailwind-theme-values'))
	const plugin = uniAppXTailwind({ customAttributes: { '*': ['pt'] } }).find(
		(plugin) => plugin.name === 'uniappx-tailwind-important-class'
	)
	assert.ok(
		plugin
			.transform(`<app-demo :pt="{ root: 'p-2!' }" />`, '/demo.uvue')
			.code.includes('p-2-important')
	)
	const defaultPlugin = defaults.find(
		(plugin) => plugin.name === 'uniappx-tailwind-important-class'
	)
	assert.equal(
		defaultPlugin.transform(`<app-demo :pt="{ root: 'p-2!' }" />`, '/default.uvue'),
		null
	)
})
