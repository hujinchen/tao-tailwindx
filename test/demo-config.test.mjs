import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'

test('示例 ESM 配置与 Web page 主题经过 HV 或 HX 配套 SDK 完整样式管线', async (t) => {
	const vitePath = process.env.UNIAPPX_TEST_VITE_IMPORT
	if (!vitePath) {
		t.skip('设置 UNIAPPX_TEST_VITE_IMPORT 为 HV 或 HX 对应配套 SDK 的 Vite 入口')
		return
	}
	const directory = await mkdtemp(join(tmpdir(), 'tailwind-demo-config-'))
	let server
	t.after(async () => {
		// SDK 另有文件监听，先删除临时工程再关闭 Vite，避免残留句柄。
		await rm(directory, { recursive: true, force: true })
		await server?.close()
	})
	await cp(fileURLToPath(new URL('./demo-template', import.meta.url)), directory, {
		recursive: true
	})
	await writeFile(join(directory, 'package.json'), '{"type":"module"}')
	const sdkRequire = createRequire(pathToFileURL(vitePath))
	const sdkDirectory = resolve(dirname(sdkRequire.resolve('vite/package.json')), '../..')
	Object.assign(process.env, {
		UNI_PLATFORM: 'h5',
		UNI_UTS_PLATFORM: 'web',
		UNI_APP_X: 'true',
		UNI_PROJECT_TYPE: 'hbuilder',
		HX_APP_ROOT: resolve(sdkDirectory, '../..'),
		UNI_CLI_CONTEXT: sdkDirectory,
		VITE_ROOT_DIR: directory,
		UNI_INPUT_DIR: directory,
		UNI_OUTPUT_DIR: join(directory, 'unpackage')
	})
	// 按 SDK CLI 的顺序初始化编译器别名，仅将 IDE 提供的依赖解析为实际文件。
	sdkRequire('@dcloudio/uni-cli-shared/dist/alias')
	const file = join(directory, 'vite.config.js')
	let source = await readFile(file, 'utf8')
	for (const [name, path] of [
		['vite', vitePath],
		['@dcloudio/vite-plugin-uni', sdkRequire.resolve('@dcloudio/vite-plugin-uni')],
		['tao-tailwindx', fileURLToPath(new URL('../index.mjs', import.meta.url))]
	])
		source = source.replace(`'${name}'`, JSON.stringify(pathToFileURL(path).href))
	await writeFile(file, source)
	const { loadConfigFromFile } = await import(pathToFileURL(vitePath))
	const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, file)
	const plugins = loaded.config.plugins.flat(Infinity)
	assert.ok(plugins.some((plugin) => plugin.name === 'uni'))
	assert.ok(plugins.some((plugin) => plugin.name === 'uniappx-tailwind-app-style'))

	// 临时工程直接引用源码 CSS 入口，避免依赖宿主的 npm 安装布局。
	const entry = join(directory, 'tailwind.css')
	await writeFile(
		entry,
		(await readFile(entry, 'utf8')).replace(
			"'tao-tailwindx/tailwind.css'",
			JSON.stringify(
				fileURLToPath(new URL('../tailwind.css', import.meta.url)).replace(/\\/g, '/')
			)
		)
	)
	const { createServer } = await import(pathToFileURL(vitePath))
	let frameworkCss
	const compatIndex = plugins.findIndex(
		(plugin) => plugin.name === 'uniappx-tailwind-vapor-compat'
	)
	plugins.splice(compatIndex, 0, {
		name: 'test-capture-framework-css',
		enforce: 'post',
		transform(code, id) {
			if (!id.includes('App.uvue?vue&type=style')) return
			const value = code.match(/const __vite__css = ("(?:\\.|[^"\\])*")/)?.[1]
			if (value) frameworkCss = JSON.parse(value)
		}
	})
	server = await createServer({
		...loaded.config,
		plugins,
		configFile: false,
		root: directory,
		logLevel: 'silent',
		server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
		optimizeDeps: { noDiscovery: true, include: [] }
	})
	await server.listen()
	const app = await server.transformRequest('/App.uvue')
	const styleUrl = app.code.match(/import\s+["']([^"']+type=style[^"']+)["']/)?.[1]
	assert.ok(styleUrl, app.code)
	const style = await server.transformRequest(styleUrl)
	const css = JSON.parse(style.code.match(/const __vite__css = ("(?:\\.|[^"\\])*")/)?.[1])
	assert.doesNotMatch(css, /:root|:global|\bpage\s*\{/)
	// 与清洗前的真实 SDK 产物对照，确保保留作用域与深色媒体查询的位置。
	const themeRules = (source) => {
		const rules = []
		postcss.parse(source).walkRules((rule) => {
			const ink = rule.nodes.find((node) => node.prop === '--demo-ink')
			if (ink) rules.push([rule.selector, ink.value, rule.parent.params ?? null])
		})
		return rules
	}
	assert.ok(frameworkCss)
	const rules = themeRules(css)
	assert.deepEqual(rules, themeRules(frameworkCss))
	for (const tag of ['uni-page-body', 'body']) {
		assert.ok(
			rules.some(
				([selector, value, media]) =>
					selector.startsWith(tag) && value === '#172033' && media == null
			)
		)
		assert.ok(
			rules.some(
				([selector, value, media]) =>
					selector.startsWith(tag) &&
					value === '#edf2fa' &&
					media === '(prefers-color-scheme: dark)'
			)
		)
	}
	assert.ok(rules.some(([selector]) => selector.includes('[data-v-')))
})
