import { performance } from 'node:perf_hooks'

// 累计值包含 await 等待；active 是钩子时间区间的并集，不能当成 CPU 耗时。
export function profilePlugins(plugins, enabled) {
	if (!enabled) return plugins
	let stats = new Map()
	let startedAt = null
	let active = 0
	let activeSince = 0
	let activeMs = 0
	let lastFinishedAt = 0
	let timer = null
	let devServer = false
	const report = (scope, failed = false) => {
		clearTimeout(timer)
		if (startedAt == null || active > 0) return
		const endedAt = scope === 'dev-window' ? lastFinishedAt : performance.now()
		const rows = [...stats.entries()].sort((a, b) => b[1].total - a[1].total)
		const total = rows.reduce((sum, [, row]) => sum + row.total, 0)
		failed ||= rows.some(([, row]) => row.errors > 0)
		console.info(
			`[uniappx-tailwind] profile: scope=${scope}; status=${failed ? 'error' : 'ok'}; wall=${(endedAt - startedAt).toFixed(1)}ms; plugin-active=${activeMs.toFixed(1)}ms; hook-sum=${total.toFixed(1)}ms`
		)
		for (const [name, row] of rows) {
			console.info(
				`[uniappx-tailwind] profile ${name}: calls=${row.calls}; changed=${row.changed}; errors=${row.errors}; total=${row.total.toFixed(1)}ms; max=${row.max.toFixed(1)}ms; slowest=${row.id}`
			)
		}
		stats = new Map()
		startedAt = null
		activeMs = 0
	}
	for (const plugin of plugins) {
		for (const hookName of ['transform', 'handleHotUpdate']) {
			const hook = plugin[hookName]
			if (hook == null) continue
			plugin[hookName] = function (...args) {
				clearTimeout(timer)
				const start = performance.now()
				startedAt ??= start
				if (active++ === 0) activeSince = start
				const key = `${plugin.name}.${hookName}`
				const row = stats.get(key) ?? {
					calls: 0,
					changed: 0,
					errors: 0,
					total: 0,
					max: 0,
					id: ''
				}
				stats.set(key, row)
				const finish = (result, failed) => {
					const end = performance.now()
					const elapsed = end - start
					row.calls++
					row.changed += result != null ? 1 : 0
					row.errors += failed ? 1 : 0
					row.total += elapsed
					if (elapsed >= row.max) {
						row.max = elapsed
						row.id = hookName === 'transform' ? args[1] : args[0].file
					}
					lastFinishedAt = end
					if (--active === 0) {
						activeMs += end - activeSince
						if (devServer) {
							timer = setTimeout(() => report('dev-window'), 150)
							timer.unref?.()
						}
					}
					return result
				}
				try {
					const result = hook.apply(this, args)
					if (result != null && typeof result.then === 'function') {
						return result.then(
							(value) => finish(value, false),
							(error) => {
								finish(null, true)
								throw error
							}
						)
					}
					return finish(result, false)
				} catch (error) {
					finish(null, true)
					throw error
				}
			}
		}
	}
	return [
		{
			name: 'uniappx-tailwind-profile',
			buildStart() {
				startedAt ??= performance.now()
			},
			buildEnd(error) {
				report('build-phase', error != null)
			},
			configureServer(server) {
				devServer = true
				server.httpServer?.once('close', () => report('dev-window'))
			},
			closeBundle() {
				report('dev-window')
			}
		},
		...plugins
	]
}
