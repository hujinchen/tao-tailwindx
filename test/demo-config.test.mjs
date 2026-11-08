import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('示例 ESM 配置可通过 uni() 注册 HBuilder V SDK 插件', async (t) => {
	const vitePath = process.env.UNIAPPX_TEST_VITE_IMPORT
	if (!vitePath) {
		t.skip('设置 UNIAPPX_TEST_VITE_IMPORT 为 HBuilder V SDK 的 Vite 入口')
		return
	}
	const directory = await mkdtemp(join(tmpdir(), 'tailwind-demo-config-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await cp(fileURLToPath(new URL('./demo-template', import.meta.url)), directory, {
		recursive: true
	})
	await writeFile(join(directory, 'package.json'), '{"type":"module"}')
	Object.assign(process.env, {
		UNI_PLATFORM: 'h5',
		UNI_APP_X: 'true',
		UNI_INPUT_DIR: directory,
		UNI_OUTPUT_DIR: join(directory, 'unpackage')
	})
	const sdkRequire = createRequire(pathToFileURL(vitePath))
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
})
