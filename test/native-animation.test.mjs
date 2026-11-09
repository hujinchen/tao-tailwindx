import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { uniAppXTailwind } from '../src/index.mjs'

const require = createRequire(import.meta.url)
const compilerPath = process.env.UNIAPPX_TEST_VAPOR_COMPILER

test(
	'HV 或 HX 配套 SDK 的 App Vapor 四种动画具有具体长属性，bounce 中点编译为非空单位变换',
	{
		skip: compilerPath
			? false
			: '设置 UNIAPPX_TEST_VAPOR_COMPILER 和 NODE_PATH 为 HV 或 HX 对应的配套 SDK 路径'
	},
	async () => {
		const compiler = require(compilerPath)
		const directory = await mkdtemp(join(tmpdir(), 'tailwind-native-animation-'))
		const previous = process.env.UNI_PLATFORM
		try {
			process.env.UNI_PLATFORM = 'app-android'
			const entry = join(directory, 'tailwind.css')
			const page = join(directory, 'Page.uvue')
			const names = ['bounce', 'ping', 'pulse', 'spin']
			const source = `<template><view class="${names.map((name) => `animate-${name}`).join(' ')}" /></template>`
			await writeFile(page, source)
			await writeFile(
				entry,
				`@import ${JSON.stringify(require.resolve('tailwindcss/index.css').replace(/\\/g, '/'))} source(none);
@source inline("${names.map((name) => `animate-${name}`).join(' ')}");
@source './Page.uvue';`
			)
			const plugins = uniAppXTailwind({ entry })
			const app = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
			const apply = plugins.find(
				(plugin) => plugin.name === 'uniappx-tailwind-apply-fallback'
			)
			const classes = plugins.find(
				(plugin) => plugin.name === 'uniappx-tailwind-important-class'
			)
			const id = join(directory, 'App.uvue') + '?vue&type=style&lang.css'
			const compiled = await app.transform("@import './tailwind.css';", id)
			const applied = await apply.transform(
				names.map((name) => `.animate-${name} { @apply animate-${name}; }`).join('\n'),
				id
			)
			const transformed = await classes.transform(source, page)
			const local = { code: transformed.code.match(/<style>([\s\S]*?)<\/style>/)[1] }
			assert.doesNotMatch(local.code, /@apply|@keyframes/)
			for (const platform of ['app-android', 'app-ios', 'app-harmony']) {
				for (const output of [compiled, applied, local]) {
					const { code } = output
					const result = await compiler.parseCss(code, {
						platform,
						output: 'bin',
						emitDebugJson: true
					})
					assert.deepEqual(result.messages, [])
					const rules = result.decoded.sections.flatMap((section) => section.rules)
					for (const name of names) {
						const rule = rules.find(
							(rule) =>
								rule.kindName === 'StyleRule' && rule.name === `animate-${name}`
						)
						const declarations = Object.fromEntries(
							rule.declarations.map((node) => [node.propertyName, node.value])
						)
						assert.equal(declarations['animation-name'], name)
						assert.equal(
							declarations['animation-duration'],
							name === 'pulse' ? '2s' : '1s'
						)
						assert.equal(declarations['animation-iteration-count'], 'infinite')
						assert.equal(declarations['animation-play-state'], 'running')
						assert.equal(
							rules.some(
								(rule) => rule.kindName === 'KeyframeBlock' && rule.name === name
							),
							output !== local
						)
					}
					if (output === local) continue
					assert.deepEqual(
						rules
							.filter(
								(rule) =>
									rule.kindName === 'KeyframeBlock' && rule.name === 'bounce'
							)
							.map((rule) => rule.qualifier),
						['0', '0.5', '1']
					)
					const middle = rules.find(
						(rule) =>
							rule.kindName === 'KeyframeBlock' &&
							rule.name === 'bounce' &&
							rule.qualifier === '0.5'
					)
					const transform = middle.declarations.find(
						(node) => node.propertyName === 'transform'
					).value
					assert.equal(transform.kind, 'transform')
					assert.equal(transform.value[0].typeName, 'TranslateY')
					assert.equal(transform.value[0].y.value, 0)
				}
			}
		} finally {
			if (previous == null) delete process.env.UNI_PLATFORM
			else process.env.UNI_PLATFORM = previous
			await rm(directory, { recursive: true, force: true })
		}
	}
)
