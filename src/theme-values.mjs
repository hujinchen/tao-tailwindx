import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'

/** 提取原选择器下的变量，键为明暗模式、选择器和变量名。 */
export function parseThemeValues(css) {
	const values = new Map()
	const root = postcss.parse(css)
	root.walkRules((rule) => {
		const declarations = rule.nodes.filter(
			(node) => node.type === 'decl' && node.prop.startsWith('--')
		)
		if (declarations.length === 0) return
		const parent = rule.parent
		const scheme =
			parent?.type === 'atrule' && parent.name === 'media' && parent.parent === root
				? parent.params.replace(/\s+/g, '').match(/^\(prefers-color-scheme:(light|dark)\)$/)
				: null
		// ponytail: 不模拟 CSS 级联；复杂条件需要先扩展数据模型，不能误作浅色变量。
		if (parent !== root && scheme == null) {
			throw new Error(`主题变量只支持顶层规则或明暗媒体查询：${rule.selector}`)
		}
		const mode = scheme?.[1] ?? 'light'
		for (const selector of rule.selectors) {
			for (const declaration of declarations) {
				const name = declaration.prop.trim()
				const value = declaration.value.trim()
				if (!value) throw new Error(`主题变量 ${name} 的值不能为空`)
				values.set(`${mode}:${selector.trim()}:${name}`, value)
			}
		}
	})
	return values
}

const quoteTsString = (value) =>
	`'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`

/** 只生成数据，不依赖组件库或运行时主题管理器。 */
export function renderThemeValues(values) {
	const entries = [...values].map(
		([name, value]) => `\t[${quoteTsString(name)}, ${quoteTsString(value)}]`
	)
	return [
		'// 此文件由主题 CSS 自动生成，请勿手动修改。',
		'export const themeValues: Map<string, string> = new Map<string, string>([',
		entries.join(',\n'),
		'])',
		''
	].join('\n')
}

/** 按显式输入导出主题数据，保留构建前同步与 watch/HMR 刷新。 */
export function themeValuesPlugin(options) {
	const input = Array.isArray(options.input) ? options.input : [options.input]
	if (
		input.length === 0 ||
		input.some((file) => typeof file !== 'string' || !file.trim()) ||
		typeof options.output !== 'string' ||
		!options.output.trim()
	) {
		throw new Error('[uniappx-tailwind] themeValues 必须配置非空的 input 和 output 路径')
	}
	const inputPaths = input.map((file) => resolve(file))
	const outputPath = resolve(options.output)
	if (inputPaths.includes(outputPath)) {
		throw new Error('[uniappx-tailwind] themeValues.output 不能覆盖输入 CSS 文件')
	}
	const sync = () => {
		const values = new Map()
		for (const inputPath of inputPaths) {
			for (const [name, value] of parseThemeValues(readFileSync(inputPath, 'utf8'))) {
				values.set(name, value)
			}
		}
		const next = renderThemeValues(values)
		const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''
		if (next === current) return
		mkdirSync(dirname(outputPath), { recursive: true })
		writeFileSync(outputPath, next)
	}
	const syncChangedFile = (file) => {
		if (inputPaths.includes(resolve(file))) sync()
	}
	return {
		name: 'uniappx-tailwind-theme-values',
		enforce: 'pre',
		// uni 可能在 buildStart 中读取脚本，配置解析完成后先准备数据。
		configResolved() {
			sync()
		},
		buildStart: {
			order: 'pre',
			handler() {
				sync()
				for (const inputPath of inputPaths) this.addWatchFile(inputPath)
			}
		},
		watchChange(file) {
			syncChangedFile(file)
		},
		handleHotUpdate(context) {
			syncChangedFile(context.file)
		}
	}
}
