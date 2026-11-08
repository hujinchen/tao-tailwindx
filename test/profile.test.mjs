import assert from 'node:assert/strict'
import { test } from 'node:test'
import { profilePlugins } from '../src/profile.mjs'

test('未开启调试时禁用性能统计', () => {
	const plugins = [
		{
			name: 'test',
			transform() {
				return null
			}
		}
	]
	const transform = plugins[0].transform
	assert.equal(profilePlugins(plugins, false), plugins)
	assert.equal(plugins[0].transform, transform)
})

test('统计所有钩子，保留同步结果和上下文，并在每次构建时重置', async () => {
	const messages = []
	const originalInfo = console.info
	console.info = (message) => messages.push(message)
	try {
		const context = { result: { code: 'output' } }
		const failure = new Error('expected failure')
		const [lifecycle, sync, asyncPlugin] = profilePlugins(
			[
				{
					name: 'sync',
					transform(code) {
						if (code === 'fail') throw failure
						return this.result
					},
					handleHotUpdate() {
						return []
					}
				},
				{
					name: 'async',
					async transform(code) {
						if (code === 'fail') throw failure
						return null
					}
				}
			],
			true
		)
		lifecycle.buildStart()
		assert.equal(sync.transform.call(context, '', 'one.uvue'), context.result)
		assert.throws(
			() => sync.transform('fail', 'bad.uvue'),
			(error) => error === failure
		)
		assert.deepEqual(sync.handleHotUpdate({ file: 'one.uvue' }), [])
		assert.equal(await asyncPlugin.transform('', 'two.uvue'), null)
		await assert.rejects(
			asyncPlugin.transform('fail', 'bad.uvue'),
			(error) => error === failure
		)
		lifecycle.buildEnd(failure)
		assert.match(
			messages[0],
			/scope=build-phase; status=error; wall=[\d.]+ms; plugin-active=[\d.]+ms; hook-sum=[\d.]+ms/
		)
		assert.ok(
			messages.some((message) =>
				/sync.transform: calls=2; changed=1; errors=1;/.test(message)
			)
		)
		assert.ok(
			messages.some((message) =>
				/async.transform: calls=2; changed=0; errors=1;/.test(message)
			)
		)
		assert.ok(messages.some((message) => /sync.handleHotUpdate: calls=1;/.test(message)))
		messages.length = 0
		lifecycle.buildStart()
		sync.transform.call(context, '', 'next.uvue')
		lifecycle.buildEnd()
		assert.equal(messages.length, 2)
		assert.match(messages[0], /status=ok/)
		assert.match(messages[1], /calls=1; changed=1; errors=0;/)
	} finally {
		console.info = originalInfo
	}
})

test('重叠的异步钩子不重复计入插件活跃时间', async () => {
	const messages = []
	const originalInfo = console.info
	console.info = (message) => messages.push(message)
	try {
		let release
		const pending = new Promise((resolve) => {
			release = resolve
		})
		const [lifecycle, plugin] = profilePlugins(
			[
				{
					name: 'async',
					transform() {
						return pending
					}
				}
			],
			true
		)
		lifecycle.buildStart()
		const first = plugin.transform('', 'one.uvue')
		const second = plugin.transform('', 'two.uvue')
		await new Promise((resolve) => setTimeout(resolve, 20))
		release(null)
		await Promise.all([first, second])
		lifecycle.buildEnd()
		const [, active, sum] = messages[0].match(/plugin-active=([\d.]+)ms; hook-sum=([\d.]+)ms/)
		assert.ok(Number(sum) > Number(active) * 1.5)
	} finally {
		console.info = originalInfo
	}
})
