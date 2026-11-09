import fs from 'node:fs'

const patchFlag = Symbol.for('uniappx-tailwind.utsRenameRetry')
const retryableCodes = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'])
const rollingSource = /[\\/]cache_$/
const rollingTarget = /[\\/]cache$/
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))

/**
 * 为 uni-app x SDK 的 uts2js 滚动缓存重试 `fs.renameSync`。
 *
 * uni-app x SDK 的 `uts` 插件在 `buildEnd` 里对 code、semantic、syntactic、types 四个滚动缓存依次执行
 * `removeSync(<cache>/cache)` 再 `renameSync(<cache>/cache_, <cache>/cache)`。`removeSync` 只是
 * `fs.rmSync(recursive, force)`，没有任何重试；Windows 上被删除的目录名在所有句柄关闭前仍处于
 * delete-pending 状态（文件监听器、杀毒软件扫描、并行运行的第二个构建都会延长这个窗口），紧随其后的
 * rename 因此抛出 EPERM，整次构建以 `[plugin:uts] EPERM` 结束。
 *
 * 补丁只作用于匹配 `.uts2js` 的目标路径，且分两级处理：
 *
 * - 先按指数退避重试。句柄通常在几十毫秒内释放，缓存得以保留，这是性能最好的结果。
 * - 预算耗尽后，如果这次 rename 正是 `cache_` -> `cache` 的滚动动作，则放弃改名并让调用方继续，
 *   不再让错误冒泡到控制台。下一次构建的 `emptyDirSync(cache_)` 会清掉半滚动状态，并把所有条目
 *   视为脏数据，代价是这一份缓存的一次全量重编译，不会读到过期缓存。
 *
 * 重试预算按时间窗口共享，因此一次 buildEnd 里的四次 rename 最多只阻塞 `budget` 毫秒。
 * 非 `.uts2js` 路径、非可重试错误码和非滚动动作的 rename 行为完全不变。
 *
 * @param {object} [options={}] 重试配置。
 * @param {RegExp} [options.match] 需要重试的目标路径规则。
 * @param {number} [options.budget=2000] 单个时间窗口内可用于重试的毫秒预算。
 * @param {number} [options.budgetWindow=8000] 预算窗口长度；同一窗口内的多次 rename 共享预算。
 * @param {number} [options.minDelay=4] 首次重试前的等待毫秒数。
 * @param {number} [options.maxDelay=64] 退避等待的毫秒上限。
 * @param {(message: string) => void} [options.onGiveUp] 放弃滚动改名时的通知回调。
 * @returns {boolean} 是否由本次调用完成打补丁。
 */
export function installUtsRenameRetry(options = {}) {
	const match = options.match ?? /[\\/]\.uts2js[\\/]/
	const budget = options.budget ?? 2000
	const budgetWindow = options.budgetWindow ?? 8000
	const minDelay = options.minDelay ?? 4
	const maxDelay = options.maxDelay ?? 64
	const onGiveUp = options.onGiveUp ?? null
	if (fs.renameSync[patchFlag] === true) return false

	const original = fs.renameSync
	let windowStartedAt = 0
	let spent = 0

	/** 取本次 rename 可用的重试预算，窗口过期后重新计费。 */
	function takeBudget(now) {
		if (now - windowStartedAt >= budgetWindow) {
			windowStartedAt = now
			spent = 0
		}
		return budget - spent > 0 ? budget - spent : 0
	}

	function renameSync(from, to) {
		let startedAt = 0
		let deadline = 0
		let delay = minDelay
		for (;;) {
			try {
				const result = original(from, to)
				if (startedAt !== 0) spent += Date.now() - startedAt
				return result
			} catch (error) {
				const target = String(to)
				if (!retryableCodes.has(error.code) || !match.test(target)) throw error

				const now = Date.now()
				if (startedAt === 0) {
					startedAt = now
					deadline = now + takeBudget(now)
				}
				if (now >= deadline) {
					spent += now - startedAt
					if (!rollingTarget.test(target) || !rollingSource.test(String(from)))
						throw error
					// 放弃改名，让 buildEnd 正常结束；缓存的代价由下一次构建重新计算。
					if (onGiveUp != null)
						onGiveUp(
							`gave up ${error.code} rename after ${now - startedAt}ms: ${target}`
						)
					return
				}
				sleep(Math.min(delay, deadline - now))
				delay = Math.min(delay * 2, maxDelay)
			}
		}
	}
	renameSync[patchFlag] = true
	fs.renameSync = renameSync
	return true
}

function sleep(milliseconds) {
	if (milliseconds <= 0) return
	Atomics.wait(sleepBuffer, 0, 0, milliseconds)
}
