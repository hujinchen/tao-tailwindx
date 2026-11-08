import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { uniAppXTailwind } from '../src/index.mjs'

const temporaryRoot = tmpdir()
const utilities = fileURLToPath(import.meta.resolve('tailwindcss/utilities.css'))

async function fixture(run, platform = 'app-android') {
	const directory = await realpath(await mkdtemp(join(temporaryRoot, 'tailwind-dependencies-')))
	const previous = process.env.UNI_PLATFORM
	process.env.UNI_PLATFORM = platform
	try {
		const entry = join(directory, 'entry.css')
		const id = join(directory, 'App.uvue') + '?vue&type=style&index=0&lang.css'
		const watched = new Set()
		// 本组检查通用扫描及全局 HMR；局部依赖与真实局部 style HMR 另有专门回归。
		const plugin = uniAppXTailwind({ entry, componentLocalStyles: false }).find(
			(item) => item.name === 'uniappx-tailwind-app-style'
		)
		const transform = (code = "@import './entry.css';") =>
			plugin.transform.call({ addWatchFile: (file) => watched.add(file) }, code, id)
		await run({ directory, entry, id, plugin, transform, watched })
	} finally {
		if (previous == null) delete process.env.UNI_PLATFORM
		else process.env.UNI_PLATFORM = previous
		await rm(directory, { recursive: true, force: true })
	}
}

test('nested relative @source keeps its declaring CSS directory', async () => {
	await fixture(async ({ directory, entry, transform, watched }) => {
		await mkdir(join(directory, 'nested/templates'), { recursive: true })
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@import './nested/config.css';`
		)
		await writeFile(join(directory, 'nested/config.css'), '@source "./templates";')
		await writeFile(
			join(directory, 'nested/templates/content.html'),
			'<div class="p-[17px]" />'
		)
		const result = await transform()
		assert.match(result.code, /padding:\s*17px/)
		assert.ok(watched.has(join(directory, 'nested/templates')), [...watched].join('\n'))
	})
})

test('platform CSS macros do not enable APP on Web or mini programs', async () => {
	for (const platform of ['web', 'h5', 'mp-weixin', 'app-android', 'app-ios', 'app-harmony']) {
		await fixture(async ({ entry, transform }) => {
			await writeFile(
				entry,
				`/* #ifdef APP */\n.app-only { padding: 11px; }\n/* #endif */\n/* #ifdef WEB && H5 */\n.web-only { padding: 12px; }\n/* #endif */\n/* #ifdef MP */\n.mp-only { padding: 13px; }\n/* #endif */`
			)
			const { code } = await transform()
			assert.equal(code.includes('.app-only'), platform.startsWith('app-'))
			assert.equal(code.includes('.web-only'), ['web', 'h5'].includes(platform))
			assert.equal(code.includes('.mp-only'), platform.startsWith('mp-'))
		}, platform)
	}
})

test('removing the App entry clears cached input but repeated downstream output remains valid', async () => {
	await fixture(async ({ entry, transform }) => {
		await writeFile(entry, '.entry-marker { padding: 19px; }')
		const first = await transform()
		assert.deepEqual(await transform(first.code), first)
		assert.equal(await transform('.local { margin: 3px; }'), null)
		assert.equal(await transform(first.code), null)
		assert.match((await transform()).code, /entry-marker/)
	})
})

test('registered App template, non-uvue sources and CSS imports share HMR invalidation', async () => {
	await fixture(async ({ directory, entry, id, transform, plugin }) => {
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@source './App.uvue';\n@source './content.html';\n@import './tokens.css';`
		)
		await writeFile(join(directory, 'App.uvue'), '<view class="p-[21px]" />')
		await writeFile(join(directory, 'content.html'), '<div class="m-[22px]" />')
		await writeFile(join(directory, 'tokens.css'), '.token { padding: 23px; }')
		await transform()
		const module = { id }
		const invalidated = []
		const server = {
			moduleGraph: {
				idToModuleMap: new Map([[id, module]]),
				invalidateModule: (item) => invalidated.push(item)
			}
		}
		for (const [file, content, expected] of [
			['App.uvue', '<view class="p-[31px]" />', /padding:\s*31px/],
			['content.html', '<div class="m-[32px]" />', /margin:\s*32px/],
			['tokens.css', '.token { padding: 33px; }', /padding:\s*33px/]
		]) {
			await writeFile(join(directory, file), content)
			assert.ok(
				(
					await plugin.handleHotUpdate({
						file: join(directory, file),
						modules: [],
						server
					})
				).includes(module)
			)
			assert.match((await transform()).code, expected)
		}
		assert.equal(
			await plugin.handleHotUpdate({
				file: join(directory, 'untracked.txt'),
				modules: [],
				server
			}),
			undefined
		)
		assert.equal(invalidated.length, 3)
	})
})

test('directory scanning detects added and deleted candidates without watcher notifications', async () => {
	await fixture(async ({ directory, entry, transform }) => {
		await mkdir(join(directory, 'templates'))
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@source './templates';`
		)
		await transform()
		const added = join(directory, 'templates/new.html')
		await writeFile(added, '<div class="p-[37px]" />')
		assert.match((await transform()).code, /padding:\s*37px/)
		await rm(added)
		assert.doesNotMatch((await transform()).code, /padding:\s*37px/)
	})
})

test('Windows 缓存重试与颜色变量显式启用，原生主题警告使用通用建议', async () => {
	const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8')
	assert.match(source, /utsRenameRetry:\s*options\.utsRenameRetry\s*\?\?\s*false/)
	assert.match(source, /use platform-compatible theme classes or CSS variables instead/)
	assert.match(source, /colorVariables:\s*options\.colorVariables\s*\?\?\s*\[\]/)
})

test('directory dependencies retain glob boundaries and ignore build output', async () => {
	await fixture(async ({ directory, entry, transform, plugin }) => {
		await mkdir(join(directory, 'templates/nested'), { recursive: true })
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@source './templates/*.html';`
		)
		plugin.configResolved({ root: directory, build: { outDir: 'templates/output' } })
		await transform()
		const server = { moduleGraph: { idToModuleMap: new Map() } }
		for (const file of ['notes.log', 'nested/ignored.html', 'output/generated.html']) {
			assert.equal(
				await plugin.handleHotUpdate({
					file: join(directory, 'templates', file),
					modules: [],
					server
				}),
				undefined
			)
		}
		await writeFile(join(directory, 'templates/new.html'), '<div class="p-[49px]" />')
		assert.match((await transform()).code, /padding:\s*49px/)
	})
})

test('real Vite watcher sends App style HMR for edits, additions and deletions', async (t) => {
	let createServer
	try {
		const viteImport = process.env.UNIAPPX_TEST_VITE_IMPORT
		createServer = (await import(viteImport ? pathToFileURL(viteImport).href : 'vite'))
			.createServer
	} catch (error) {
		if (error.code !== 'ERR_MODULE_NOT_FOUND' || process.env.UNIAPPX_TEST_VITE_IMPORT != null)
			throw error
		t.skip('Vite is unavailable; set UNIAPPX_TEST_VITE_IMPORT to a local Vite module')
		return
	}
	await fixture(async ({ directory, entry, id }) => {
		await mkdir(join(directory, 'templates'))
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@source './templates';\n@source './App.uvue';\n@import './tokens.css';`
		)
		await writeFile(join(directory, 'App.uvue'), '<view class="p-[41px]" />')
		await writeFile(join(directory, 'templates/content.html'), '<div class="m-[42px]" />')
		await writeFile(join(directory, 'tokens.css'), '.token { padding: 43px; }')
		const server = await createServer({
			configFile: false,
			root: directory,
			logLevel: 'silent',
			server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
			plugins: [
				{
					name: 'test-app-style-loader',
					load(moduleId) {
						if (moduleId === id.replace(/\\/g, '/')) return "@import './entry.css';"
					}
				},
				...uniAppXTailwind({ entry, componentLocalStyles: false })
			]
		})
		let socket
		try {
			await server.listen()
			const url = '/App.uvue' + id.slice(id.indexOf('?'))
			const initial = await server.transformRequest(url)
			assert.match(initial.code, /padding:\s*41px/)
			assert.match(initial.code, /import\.meta\.hot\.accept/, initial.code)
			const messages = []
			socket = new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}`, 'vite-hmr')
			socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)))
			await new Promise((resolve, reject) => {
				socket.addEventListener('open', resolve, { once: true })
				socket.addEventListener('error', reject, { once: true })
			})
			await delay(100)
			for (const [file, content, expected, deleted] of [
				['App.uvue', '<view class="p-[51px]" />', /padding:\s*51px/],
				['templates/content.html', '<div class="m-[52px]" />', /margin:\s*52px/],
				['tokens.css', '.token { padding: 53px; }', /padding:\s*53px/],
				['templates/new.txt', '<div class="p-[54px]" />', /padding:\s*54px/],
				['templates/new.txt', null, /padding:\s*54px/, true]
			]) {
				const start = messages.length
				if (content == null) await rm(join(directory, file))
				else await writeFile(join(directory, file), content)
				const deadline = Date.now() + 10000
				while (
					!messages
						.slice(start)
						.some(
							(message) =>
								message.type === 'update' &&
								message.updates.some((update) => update.path.includes('App.uvue'))
						)
				) {
					assert.ok(
						Date.now() < deadline,
						`No App style HMR for ${file}: ${JSON.stringify(messages.slice(start))}`
					)
					await delay(25)
				}
				const result = await server.transformRequest(url)
				if (file !== 'templates/new.txt') {
					assert.ok(
						!messages.slice(start).some((message) => message.type === 'full-reload'),
						`${file}: ${JSON.stringify(messages.slice(start))}`
					)
				} else {
					t.diagnostic(
						`${deleted ? 'unlink' : 'add'}: ${JSON.stringify(messages.slice(start))}`
					)
				}
				if (deleted) assert.doesNotMatch(result.code, expected)
				else assert.match(result.code, expected)
			}
		} finally {
			socket?.close()
			await server.close()
		}
	}, 'web')
})

test('real Vite HMR keeps generated .uvue style updates after Vue filters unchanged SFC styles', async (t) => {
	let createServer
	try {
		const viteImport = process.env.UNIAPPX_TEST_VITE_IMPORT
		createServer = (await import(viteImport ? pathToFileURL(viteImport).href : 'vite'))
			.createServer
	} catch (error) {
		if (error.code !== 'ERR_MODULE_NOT_FOUND' || process.env.UNIAPPX_TEST_VITE_IMPORT != null)
			throw error
		t.skip('Vite is unavailable; set UNIAPPX_TEST_VITE_IMPORT to a local Vite module')
		return
	}
	await fixture(async ({ directory, entry }) => {
		const page = join(directory, 'page.uvue')
		const normalizedPage = page.replace(/\\/g, '/')
		const pageScriptId = `${normalizedPage}?vue&type=script&lang.ts`
		const pageStyleId = `${normalizedPage}?vue&type=style&index=0&scoped=abc123&lang.css`
		const styleQuery = pageStyleId.slice(pageStyleId.indexOf('?'))
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@theme { --color-primary: #345678; --spacing: 0.25rem; }\n@source './page.uvue';`
		)
		await writeFile(
			page,
			'<template><view class="bg-primary/10 p-8" /></template><style scoped>.panel { color: red; }</style>'
		)
		const server = await createServer({
			configFile: false,
			root: directory,
			logLevel: 'silent',
			server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
			plugins: [
				{
					name: 'test-uvue-module-loader',
					load(id) {
						if (id === pageScriptId)
							return `import ${JSON.stringify(`./page.uvue${styleQuery}`)}; if (import.meta.hot) import.meta.hot.accept(); export const page = true;`
						if (id !== pageStyleId) return null
						return readFile(page, 'utf8').then(
							(source) =>
								source.match(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/i)?.[1] ?? ''
						)
					}
				},
				...uniAppXTailwind({ entry }),
				{
					name: 'test-vue-sfc-style-filter',
					handleHotUpdate(context) {
						if (context.file !== page) return
						return context.modules.filter(
							(module) => !module.id?.includes('?vue&type=style')
						)
					}
				}
			]
		})
		let socket
		try {
			await server.listen()
			const initial = await server.transformRequest(pageScriptId)
			assert.ok(initial)
			const initialStyle = await server.transformRequest(`/page.uvue${styleQuery}`)
			assert.match(initialStyle.code, /\.bg-primary-10\s*\{/)
			const messages = []
			socket = new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}`, 'vite-hmr')
			socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)))
			await new Promise((resolve, reject) => {
				socket.addEventListener('open', resolve, { once: true })
				socket.addEventListener('error', reject, { once: true })
			})
			await delay(100)
			await writeFile(
				page,
				'<template><view class="bg-primary/80 p-81" /></template><style scoped>.panel { color: red; }</style>'
			)
			const deadline = Date.now() + 10000
			let update
			while (Date.now() < deadline) {
				update = messages
					.flatMap((message) => (message.type === 'update' ? message.updates : []))
					.find((item) => item.path.includes('page.uvue?vue&type=style'))
				if (update) break
				await delay(25)
			}
			assert.ok(update, `No page style HMR update: ${JSON.stringify(messages)}`)
			const updatedStyle = await server.transformRequest(`/page.uvue${styleQuery}`)
			assert.match(updatedStyle.code, /\.bg-primary-80\s*\{/)
			assert.match(updatedStyle.code, /\.p-81\s*\{/)
			assert.doesNotMatch(updatedStyle.code, /\.bg-primary-10\s*\{/)
			assert.doesNotMatch(updatedStyle.code, /\.p-8\s*\{/)
			assert.equal(
				messages.some((message) => message.type === 'full-reload'),
				false
			)
		} finally {
			socket?.close()
			await server.close()
		}
	}, 'web')
})

test('真实 Vite 的共享脚本 HMR 同时更新两个 SFC 的局部样式', async (t) => {
	const viteImport = process.env.UNIAPPX_TEST_VITE_IMPORT
	if (!viteImport) {
		t.skip('Set UNIAPPX_TEST_VITE_IMPORT to a local Vite module')
		return
	}
	const { createServer } = await import(pathToFileURL(viteImport).href)
	await fixture(async ({ directory, entry }) => {
		const shared = join(directory, 'shared.ts')
		const styleQuery = '?vue&type=style&index=0&lang.css'
		const scriptQuery = '?vue&type=script&lang.ts'
		await writeFile(
			entry,
			`@import ${JSON.stringify(utilities)} source(none);\n@source './*.{ts,uvue}';`
		)
		await writeFile(shared, 'export const value = "p-[71px]"')
		for (const name of ['a', 'b'])
			await writeFile(
				join(directory, `${name}.uvue`),
				'<template><view :class="value" /></template><script setup>import { value } from "./shared.ts"</script><style>.box { color: red; }</style>'
			)
		const server = await createServer({
			configFile: false,
			root: directory,
			logLevel: 'silent',
			server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
			plugins: [
				{
					name: 'test-shared-sfc-loader',
					load(id) {
						if (id.endsWith(scriptQuery)) {
							const name = id.slice(0, id.indexOf('?')).split('/').at(-1)
							return `import './shared.ts'; import './${name}${styleQuery}'; if (import.meta.hot) import.meta.hot.accept();`
						}
						if (id.endsWith(styleQuery)) return '.box { color: red; }'
					}
				},
				...uniAppXTailwind({ entry })
			]
		})
		let socket
		try {
			await server.listen()
			for (const name of ['a', 'b']) {
				await server.transformRequest(`/${name}.uvue${scriptQuery}`)
				assert.match(
					(await server.transformRequest(`/${name}.uvue${styleQuery}`)).code,
					/padding:\s*71px/
				)
			}
			const messages = []
			socket = new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}`, 'vite-hmr')
			socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)))
			await new Promise((resolve, reject) => {
				socket.addEventListener('open', resolve, { once: true })
				socket.addEventListener('error', reject, { once: true })
			})
			await writeFile(shared, 'export const value = "p-[72px]"')
			const deadline = Date.now() + 10000
			while (Date.now() < deadline) {
				const paths = messages.flatMap(
					(message) => message.updates?.map((update) => update.path) ?? []
				)
				if (['a', 'b'].every((name) => paths.includes(`/${name}.uvue${styleQuery}`))) break
				await delay(25)
			}
			const paths = messages.flatMap(
				(message) => message.updates?.map((update) => update.path) ?? []
			)
			for (const name of ['a', 'b']) {
				assert.ok(paths.includes(`/${name}.uvue${styleQuery}`), JSON.stringify(messages))
				const output = await server.transformRequest(`/${name}.uvue${styleQuery}`)
				assert.match(output.code, /padding:\s*72px/)
				assert.doesNotMatch(output.code, /padding:\s*71px/)
			}
			assert.equal(
				messages.some((message) => message.type === 'full-reload'),
				false
			)
		} finally {
			socket?.close()
			await server.close()
		}
	}, 'web')
})
