import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { installUtsRenameRetry } from '../src/uts-rename-retry.mjs'

const cacheRoot = 'D:/project/unpackage/cache/vapor/.app-android/.uts2js/cache/uts_1/code'
const utsPath = `${cacheRoot}/cache`

function fakeRename(implementation) {
	const original = fs.renameSync
	fs.renameSync = implementation
	return () => {
		fs.renameSync = original
	}
}

function permissionError(code) {
	const error = new Error(`${code}: operation not permitted, rename`)
	error.code = code
	return error
}

test('uts2js 缓存路径重命名遇到可重试错误时重试', () => {
	const attempts = []
	const restore = fakeRename((from, to) => {
		attempts.push(to)
		if (attempts.length < 3) throw permissionError('EPERM')
		return 'renamed'
	})
	try {
		const installed = installUtsRenameRetry({ minDelay: 0, maxDelay: 0 })

		assert.equal(installed, true)
		assert.equal(fs.renameSync(`${utsPath}_`, utsPath), 'renamed')
		assert.equal(attempts.length, 3)
	} finally {
		restore()
	}
})

test('无关路径或无关错误不重试', () => {
	const attempts = []
	const restore = fakeRename((from, to) => {
		attempts.push(to)
		throw permissionError(to.includes('.uts2js') ? 'ENOENT' : 'EPERM')
	})
	try {
		installUtsRenameRetry({ minDelay: 0, maxDelay: 0 })

		assert.throws(() => fs.renameSync('/tmp/a', '/tmp/b'), { code: 'EPERM' })
		assert.throws(() => fs.renameSync(`${utsPath}_`, utsPath), { code: 'ENOENT' })
		assert.equal(attempts.length, 2)
	} finally {
		restore()
	}
})

test('滚动缓存重命名失败时放弃重试但不中断构建', () => {
	let calls = 0
	const restore = fakeRename(() => {
		calls += 1
		throw permissionError('EPERM')
	})
	try {
		const messages = []
		installUtsRenameRetry({
			budget: 0,
			minDelay: 0,
			onGiveUp: (message) => messages.push(message)
		})

		assert.equal(fs.renameSync(`${utsPath}_`, utsPath), undefined)
		assert.equal(calls, 1)
		assert.equal(messages.length, 1)
		assert.match(messages[0], /EPERM/)
		assert.match(messages[0], /code\/cache$/)
	} finally {
		restore()
	}
})

test('非滚动缓存重命名耗尽重试后继续抛错', () => {
	const restore = fakeRename(() => {
		throw permissionError('EBUSY')
	})
	try {
		installUtsRenameRetry({ budget: 0, minDelay: 0 })

		assert.throws(() => fs.renameSync(`${cacheRoot}/a`, `${cacheRoot}/b`), { code: 'EBUSY' })
	} finally {
		restore()
	}
})

test('同一时间窗口内的重命名共享重试预算', () => {
	const calls = []
	const restore = fakeRename(() => {
		calls[calls.length - 1] += 1
		throw permissionError('EPERM')
	})
	try {
		installUtsRenameRetry({ budget: 20, budgetWindow: 60_000, minDelay: 10, maxDelay: 10 })

		calls.push(0)
		fs.renameSync(`${utsPath}_`, utsPath)
		calls.push(0)
		fs.renameSync(`${utsPath}_`, utsPath)

		assert.ok(calls[0] >= 2, `expected retries, got ${calls[0]}`)
		assert.equal(calls[1], 1)
	} finally {
		restore()
	}
})

test('时间窗口结束后重新计算重试预算', () => {
	const calls = []
	const restore = fakeRename(() => {
		calls[calls.length - 1] += 1
		throw permissionError('EPERM')
	})
	try {
		installUtsRenameRetry({ budget: 20, budgetWindow: 0, minDelay: 10, maxDelay: 10 })

		calls.push(0)
		fs.renameSync(`${utsPath}_`, utsPath)
		calls.push(0)
		fs.renameSync(`${utsPath}_`, utsPath)

		assert.ok(calls[0] >= 2, `expected retries, got ${calls[0]}`)
		assert.ok(calls[1] >= 2, `expected retries, got ${calls[1]}`)
	} finally {
		restore()
	}
})

test('重命名补丁只安装一次', () => {
	const restore = fakeRename(() => 'renamed')
	try {
		assert.equal(installUtsRenameRetry(), true)
		assert.equal(installUtsRenameRetry(), false)
	} finally {
		restore()
	}
})
