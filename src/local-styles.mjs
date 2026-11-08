import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import scssParser from 'postcss-scss'
import { toSafeClassName } from './class-name.mjs'
import { collectScriptImports } from './script-imports.mjs'
import { filterConditions } from './conditions.mjs'
import { decodeClassAttributeValues } from './class-values.mjs'
import { scanSfc } from './sfc.mjs'

const require = createRequire(import.meta.url)
const requireTailwind = createRequire(require.resolve('@tailwindcss/postcss'))
const { Scanner } = requireTailwind('@tailwindcss/oxide')
const scanner = new Scanner({ sources: [] })
const scriptExtensions = ['.ts', '.uts', '.js', '.mjs', '.cjs', '.tsx', '.jsx']

/** 缓存原始候选与 import；主题或排除条件变化时仍按本轮生成集合重新筛选。 */
async function readSourceRecord(file, signature, conditionContext, customAttributes) {
	let content
	try {
		content = await readFile(file, 'utf8')
	} catch (error) {
		if (error.code === 'ENOENT') return null
		throw error
	}
	const extension = extname(file).slice(1).toLowerCase()
	const isSfc = extension === 'uvue'
	const source =
		conditionContext == null ? content : filterConditions(content, conditionContext, file)
	const blocks = isSfc ? scanSfc(source) : []
	const applyCandidates = new Set()
	let scanContent = ''
	let cursor = 0
	for (const style of blocks.filter((block) => block.name === 'style')) {
		scanContent += source.slice(cursor, style.start)
		cursor = style.end
		const css = source.slice(style.contentStart, style.contentEnd)
		if (!css.includes('@apply')) continue
		scssParser.parse(css, { from: file }).walkAtRules('apply', (node) => {
			for (const candidate of node.params.trim().split(/\s+/)) applyCandidates.add(candidate)
		})
	}
	scanContent += source.slice(cursor)
	const decoded = isSfc ? decodeClassAttributeValues(scanContent, customAttributes) : scanContent
	const scan = (value) =>
		scanner
			.getCandidatesWithPositions({ file, extension, content: value })
			.map(({ candidate }) => candidate)
	const candidates = new Map(
		scan(decoded).map((candidate) => [candidate, toSafeClassName(candidate)])
	)
	const encodedCandidates = new Set()
	if (decoded !== scanContent) {
		const original = new Set(scan(scanContent))
		for (const candidate of candidates.keys())
			if (!original.has(candidate)) encodedCandidates.add(candidate)
	}
	const imports = new Set()
	if (isSfc) {
		for (const block of blocks.filter((block) => block.name === 'script')) {
			const external = block.attributes.match(/\bsrc\s*=\s*(['"])(.*?)\1/i)
			if (external) imports.add(external[2])
			for (const value of collectScriptImports(
				source.slice(block.contentStart, block.contentEnd)
			))
				imports.add(value)
		}
	} else {
		for (const value of collectScriptImports(source)) imports.add(value)
	}
	return {
		file,
		signature,
		content,
		isSfc,
		candidates,
		encodedCandidates,
		applyCandidates,
		imports,
		dependencies: null
	}
}

/** 入口扫描与局部归属复用同一批记录，实体候选补编译不重复读取文件。 */
export async function collectSourceCache(
	files,
	{
		sourceCache = null,
		signatures = new Map(),
		conditionContext = null,
		customAttributes = {}
	} = {}
) {
	const records = new Map()
	let sameInputs = true
	const scannableFiles = files.filter(
		(file) =>
			/\.(?:uvue|vue|[cm]?js|jsx|ts|tsx|uts|html|md|mdx|txt)$/i.test(file) &&
			!/\.d\.(?:ts|uts|mts|cts)$/i.test(file)
	)
	if (
		sourceCache?.records.size === scannableFiles.length &&
		scannableFiles.every((file) => {
			const cached = sourceCache.records.get(normalizeLocalPath(file))
			return signatures.get(file) != null && cached?.signature === signatures.get(file)
		})
	)
		return {
			records: new Map(sourceCache.records),
			resolveImport: sourceCache.resolveImport,
			stylesChanged: false
		}
	for (let index = 0; index < scannableFiles.length; index += 32) {
		const batch = scannableFiles.slice(index, index + 32)
		const loaded = []
		const pending = []
		for (const [batchIndex, file] of batch.entries()) {
			const cached = sourceCache?.records.get(normalizeLocalPath(file))
			const signature = signatures.get(file) ?? null
			if (signature != null && cached?.signature === signature) loaded.push(cached)
			else {
				const record = readSourceRecord(file, signature, conditionContext, customAttributes)
				loaded.push(null)
				pending.push({ batchIndex, record })
			}
		}
		if (pending.length > 0) {
			const resolved = await Promise.all(pending.map(({ record }) => record))
			for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex++)
				loaded[pending[pendingIndex].batchIndex] = resolved[pendingIndex]
		}
		for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
			const file = batch[batchIndex]
			const key = normalizeLocalPath(file)
			const cached = sourceCache?.records.get(key)
			let record = loaded[batchIndex]
			if (record == null) continue
			const unchanged =
				record === cached ||
				(cached != null &&
					['candidates', 'encodedCandidates', 'applyCandidates', 'imports'].every(
						(name) =>
							cached[name].size === record[name].size &&
							[...record[name].keys()].every((value) => cached[name].has(value))
					))
			if (!unchanged) sameInputs = false
			else if (record !== cached) record = { ...record, dependencies: cached.dependencies }
			records.set(key, record)
		}
	}
	const sameFiles =
		sourceCache?.records.size === records.size &&
		[...records.keys()].every((file) => sourceCache.records.has(file))
	if (!sameFiles) {
		for (const [file, record] of records) {
			if (record.dependencies != null) records.set(file, { ...record, dependencies: null })
		}
	}
	return {
		records,
		resolveImport: sameFiles ? sourceCache.resolveImport : null,
		stylesChanged: !sameFiles || !sameInputs
	}
}

/** 文件级收集完整候选；App 与公共 inline 明确归全局，其余 SFC 各自拥有局部规则。 */
export async function collectLocalStyles(
	files,
	generatedCandidates,
	entrySource,
	{
		appFile,
		resolveImport = null,
		componentLocalStyles = true,
		sourceCache = null,
		conditionContext = null,
		customAttributes = {},
		signatures = new Map()
	} = {}
) {
	const generatedNames = new Set([...generatedCandidates].map(toSafeClassName))
	const { records } = await collectSourceCache(files, {
		sourceCache,
		signatures,
		conditionContext,
		customAttributes
	})
	const candidatesByFile = new Map()
	const applyCandidates = new Set()
	const usedCandidates = new Set()
	for (const [key, record] of records) {
		for (const candidate of record.applyCandidates) {
			if (generatedNames.has(toSafeClassName(candidate))) applyCandidates.add(candidate)
		}
		const candidates = new Set()
		for (const [candidate, alias] of record.candidates) {
			if (!generatedNames.has(alias)) continue
			candidates.add(candidate)
			usedCandidates.add(candidate)
		}
		candidatesByFile.set(key, candidates)
	}

	const globalCandidates = new Set()
	const inlinePatterns = collectInlinePatterns(entrySource)
	for (const candidate of generatedCandidates) {
		if (inlinePatterns.some((pattern) => matchesInlinePattern(candidate, pattern)))
			globalCandidates.add(candidate)
	}
	const ownersByFile = new Map()
	const localByFile = new Map()
	const edges = new Map()
	// 文件增删、扫描边界或宿主 resolver 变化时，重新解析路径，包含此前未命中的 import。
	const reuseResolutions =
		sourceCache?.resolveImport === resolveImport &&
		sourceCache.records.size === records.size &&
		[...records.keys()].every((file) => sourceCache.records.has(file))
	if (!reuseResolutions) {
		for (const [file, record] of records) {
			if (record.dependencies != null) records.set(file, { ...record, dependencies: null })
		}
	}
	// 依赖只缓存路径，遍历时获取本轮记录，避免共享脚本更新后读到旧候选。
	async function dependenciesOf(record) {
		const key = normalizeLocalPath(record.file)
		if (edges.has(key)) return edges.get(key)
		if (reuseResolutions && record.dependencies != null) {
			edges.set(key, record.dependencies)
			return record.dependencies
		}
		const dependencies = []
		for (const specifier of record.imports) {
			let target = null
			if (resolveImport) {
				const resolved = await resolveImport(specifier, record.file)
				target = typeof resolved === 'string' ? resolved : resolved?.id
			} else if (specifier.startsWith('.')) {
				// 独立 Node 调用没有 Vite 上下文，仅按已扫描的相对模块解析。
				const base = resolve(dirname(record.file), specifier)
				const paths = [
					base,
					...scriptExtensions.map((ext) => base + ext),
					...scriptExtensions.map((ext) => resolve(base, 'index' + ext))
				]
				target = paths.find((path) => records.has(normalizeLocalPath(path)))
			}
			if (!target || target.includes('?') || target.startsWith('\0')) continue
			const dependency = records.get(normalizeLocalPath(target))
			if (!dependency || dependency.isSfc || !scriptExtensions.includes(extname(target)))
				continue
			dependencies.push(normalizeLocalPath(target))
		}
		// 不修改上一轮缓存；只有最新入口编译完成后，调用方才发布新快照。
		records.set(key, { ...record, dependencies })
		edges.set(key, dependencies)
		return dependencies
	}

	for (const record of records.values()) {
		if (!record.isSfc) continue
		const owner = normalizeLocalPath(record.file)
		const candidates = new Set()
		const pending = [record]
		const visited = new Set()
		while (pending.length > 0) {
			const current = pending.pop()
			const key = normalizeLocalPath(current.file)
			if (visited.has(key)) continue
			visited.add(key)
			if (!ownersByFile.has(key)) ownersByFile.set(key, new Set())
			ownersByFile.get(key).add(record.file)
			for (const candidate of candidatesByFile.get(key)) candidates.add(candidate)
			if (componentLocalStyles)
				pending.push(...(await dependenciesOf(current)).map((file) => records.get(file)))
		}
		if (appFile != null && owner === normalizeLocalPath(appFile)) {
			for (const candidate of candidates) globalCandidates.add(candidate)
		} else if (candidates.size > 0) localByFile.set(owner, candidates)
	}

	const aliasesByFile = new Map()
	const order = new Map(
		[...generatedCandidates].map((name, index) => [toSafeClassName(name), index])
	)
	for (const [file, candidates] of localByFile) {
		aliasesByFile.set(
			file,
			new Map(
				[...candidates]
					.sort((a, b) => order.get(toSafeClassName(a)) - order.get(toSafeClassName(b)))
					.map((candidate) => [candidate, toSafeClassName(candidate)])
			)
		)
	}
	const applyOnlyCandidates = new Set(
		[...applyCandidates].filter(
			(candidate) => !usedCandidates.has(candidate) && !globalCandidates.has(candidate)
		)
	)
	const unownedFiles = [...records.entries()]
		.filter(([file]) => !ownersByFile.has(file) && candidatesByFile.get(file).size > 0)
		.map(([, record]) => record.file)
	return {
		aliasesByFile,
		globalCandidates,
		applyOnlyCandidates,
		ownersByFile,
		unownedFiles,
		sourceCache: { records, resolveImport }
	}
}

/** 完整 SFC 和 HMR 共用目标选择；Vue 忽略无 src 的空样式块，索引按保留块计算。 */
function selectLocalStyle(content, scoped, conditionContext, file) {
	const source =
		conditionContext == null ? content : filterConditions(content, conditionContext, file)
	const blocks = scanSfc(source)
		.filter((block) => block.name === 'style')
		.map((block) => ({
			...block,
			content: source.slice(block.contentStart, block.contentEnd),
			external: /(?:^|\s)src\s*=/i.test(block.attributes),
			module: /(?:^|\s)module(?:\s|=|$)/i.test(block.attributes),
			scoped: /(?:^|\s)scoped(?:\s|=|$)/i.test(block.attributes)
		}))
	const eligible = blocks.filter((block) => !block.external && !block.module)
	const style = scoped
		? (eligible.filter((block) => block.scoped).at(-1) ?? eligible.at(-1))
		: eligible.find((block) => !block.scoped)
	const preceding = style == null ? blocks : blocks.slice(0, blocks.indexOf(style))
	const index = preceding.filter(
		(block) => block.external || block.content.trim().length > 0
	).length
	return { style, index }
}

/** Web 端复用 .uvue 的隔离样式块，原生端遵循 uni-app x 的普通样式隔离策略。 */
export function transformLocalStyles(
	code,
	file,
	aliasesByFile,
	scoped = false,
	compiledRules = new Map(),
	conditionContext = null
) {
	const aliases = aliasesByFile.get(normalizeLocalPath(file))
	if (aliases == null || aliases.size === 0) return code
	const { style } = selectLocalStyle(code, scoped, conditionContext, file)
	if (style?.content.includes('/* Tailwind 局部工具类 */')) return code
	const rules = renderLocalRules(
		aliases,
		compiledRules,
		scoped && /\blang\s*=\s*(['"])s[ac]ss\1/i.test(style?.attributes ?? '')
	)
	if (style != null) {
		const block = code.slice(style.start, style.end)
		const closing = style.selfClosing ? '</style>' : code.slice(style.contentEnd, style.end)
		const opening = style.selfClosing
			? block.replace(/\/>$/, '>')
			: block.slice(0, -closing.length)
		const output = `${opening}\n/* Tailwind 局部工具类 */\n${rules}\n${closing}`
		return code.slice(0, style.start) + output + code.slice(style.end)
	}
	const scopedAttribute = scoped ? ' scoped' : ''
	return `${code}\n<style${scopedAttribute}>\n/* Tailwind 局部工具类 */\n${rules}\n</style>`
}

/** 返回完整 SFC 转换时承载局部 utility 的 style 块索引。 */
export function getLocalStyleTargetIndex(content, scoped = false, conditionContext = null) {
	return selectLocalStyle(content, scoped, conditionContext, 'component.uvue').index
}

/** 将局部规则追加到独立 style 虚拟模块，供 HMR 的 style-only 更新复用。 */
export function appendLocalStyleRules(
	code,
	aliases,
	compiledRules = new Map(),
	protectSass = false
) {
	const marker = '/* Tailwind 局部工具类 */'
	const markerIndex = code.indexOf(marker)
	const baseCode = markerIndex === -1 ? code : code.slice(0, markerIndex).trimEnd()
	if (aliases.size === 0) return baseCode
	const rules = renderLocalRules(aliases, compiledRules, protectSass)
	return `${baseCode}\n${marker}\n${rules}\n`
}

/** 直接复用入口生成的 CSS；仅在进入 Sass 前保护其会主动计算的无穷大表达式。 */
function renderLocalRules(aliases, compiledRules, protectSass) {
	const rules = [...aliases.values()]
		.map((alias) => {
			const rule = compiledRules.get(alias)
			if (rule == null) throw new Error(`[uniappx-tailwind] 缺少局部工具类编译结果：${alias}`)
			return rule
		})
		.join('\n')
	return protectSass
		? rules.replace(
				/calc\(infinity\s*\*\s*1(?:px|rpx)\)/g,
				(value) => `#{${JSON.stringify(value)}}`
			)
		: rules
}

function collectInlinePatterns(source) {
	const patterns = []
	source.walkAtRules('source', (node) => {
		const match = node.params.match(/^inline\(([\s\S]*)\)$/)
		if (match == null) return
		for (const literal of match[1].matchAll(/(["'])([\s\S]*?)\1/g)) {
			patterns.push(...literal[2].trim().split(/\s+/).filter(Boolean))
		}
	})
	return patterns
}

/** 按嵌套备选和数值范围匹配 Tailwind brace expansion，不展开巨量候选。 */
function matchesInlinePattern(candidate, pattern) {
	const open = pattern.indexOf('{')
	if (open < 0) return candidate === pattern
	let depth = 1
	let end = open + 1
	while (end < pattern.length && depth) {
		if (pattern[end] === '{') depth++
		if (pattern[end] === '}') depth--
		end++
	}
	if (depth) return candidate === pattern
	const prefix = pattern.slice(0, open)
	if (!candidate.startsWith(prefix)) return false
	const suffix = pattern.slice(end)
	const body = pattern.slice(open + 1, end - 1)
	const alternatives = splitInlineAlternatives(body)
	if (alternatives.length > 1)
		return alternatives.some((part) => matchesInlinePattern(candidate, prefix + part + suffix))
	const range = body.match(/^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/)
	if (!range) return matchesInlinePattern(candidate, prefix + body + suffix)
	const start = Number(range[1]),
		stop = Number(range[2]),
		step = Math.abs(Number(range[3] ?? 1))
	if (!step) return false
	for (const match of candidate.slice(prefix.length).matchAll(/^-?\d+/g)) {
		// 数字后可能还有数字字面量；逐个边界验证后缀。
		for (let length = 1; length <= match[0].length; length++) {
			const text = match[0].slice(0, length),
				number = Number(text)
			if (
				text !== String(number) ||
				number < Math.min(start, stop) ||
				number > Math.max(start, stop) ||
				Math.abs(number - start) % step
			)
				continue
			if (matchesInlinePattern(candidate, prefix + text + suffix)) return true
		}
	}
	return false
}

function splitInlineAlternatives(value) {
	const alternatives = []
	let depth = 0,
		start = 0
	for (let index = 0; index < value.length; index++) {
		if (value[index] === '{') depth++
		else if (value[index] === '}') depth--
		else if (value[index] === ',' && depth === 0) {
			alternatives.push(value.slice(start, index))
			start = index + 1
		}
	}
	alternatives.push(value.slice(start))
	return alternatives
}

function normalizeLocalPath(file) {
	const normalized = resolve(file).replace(/\\/g, '/')
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
