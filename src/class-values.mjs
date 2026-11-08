import { fileURLToPath } from 'node:url'
import { toSafeClassName } from './class-name.mjs'
import { scanSfc, voidTags } from './sfc.mjs'

const tagPattern = /\{\{[\s\S]*?\}\}|<\/?([A-Za-z][\w.-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g
const attributePattern = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:(["'])([\s\S]*?)\2|([^\s"'=<>`]+)))?/g
const runtimeModule = fileURLToPath(new URL('./class-runtime.mjs', import.meta.url)).replace(
	/\\/g,
	'/'
)

/** 分析 class 绑定处的结果值以转换安全类名，不决定 CSS 的文件归属。 */
export function collectClassValueRanges(
	code,
	customAttributes = {},
	onDynamic = () => {},
	bindings = collectClassBindings(code, customAttributes)
) {
	const ranges = []
	const declarations = new Map()
	const scripts = [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
	const regions = scripts.length
		? scripts.map((match) => [match.index + match[0].indexOf('>') + 1, match[1]])
		: /<(?:template|style)\b/i.test(code)
			? []
			: [[0, code]]
	const scriptTokens = regions.map(([offset, source]) => tokenizeScript(source, offset))
	for (const tokens of scriptTokens) {
		for (let i = 0; i < tokens.length; i++) {
			if (!['const', 'let', 'var'].includes(tokens[i].value)) continue
			const name = tokens[i + 1]?.value
			let start = i + 2
			while (start < tokens.length && !['=', ';'].includes(tokens[start].value)) start++
			if (tokens[start]?.value !== '=') continue
			let end = start + 1
			while (end < tokens.length) {
				if (
					tokens[end].value === ';' ||
					(end > start + 1 && ['const', 'let', 'var'].includes(tokens[end].value))
				)
					break
				if (end > start + 1 && endsExpression(code, tokens, end)) break
				end = nextToken(tokens, end)
			}
			declarations.set(name, tokens.slice(start + 1, end))
		}
	}
	const visited = new Set()
	function visit(tokens, mode, external, tag = '*') {
		if (!tokens.length) return
		const key = `${tokens[0].start}:${tokens.at(-1).end}:${mode}:${external}:${tag}`
		if (visited.has(key)) return
		visited.add(key)
		if (tokens[0].value === '(' && tokens[0].close === tokens.at(-1))
			return visit(tokens.slice(1, -1), mode, external, tag)
		const top = []
		for (let i = 0; i < tokens.length; i = nextToken(tokens, i)) top.push(i)
		const assertion = top.find((i) => ['as', 'satisfies'].includes(tokens[i].value))
		if (assertion != null) return visit(tokens.slice(0, assertion), mode, external, tag)
		if (tokens.at(-1).value === '!') return visit(tokens.slice(0, -1), mode, external, tag)
		const arrow = top.find((i) => tokens[i].value === '=>')
		if (arrow != null) {
			const body = tokens.slice(arrow + 1)
			if (body[0]?.value !== '{') return visit(body, mode, external, tag)
			// 只跟踪返回值，不把函数体的条件和日志当作 class。
			for (let i = 1; i < body.length; i++) {
				if (body[i].value !== 'return') continue
				let end = i + 1
				while (end < body.length - 1 && ![';', '}'].includes(body[end].value)) {
					if (end > i + 1 && endsExpression(code, body, end)) break
					end = nextToken(body, end)
				}
				visit(body.slice(i + 1, end), mode, external, tag)
			}
			return
		}
		const question = top.find((i) => tokens[i].value === '?')
		if (question != null) {
			let depth = 0
			const colon = top.find((i) => {
				if (i <= question) return false
				if (tokens[i].value === '?') depth++
				if (tokens[i].value !== ':') return false
				return depth-- === 0
			})
			if (colon != null) {
				visit(tokens.slice(question + 1, colon), mode, external, tag)
				visit(tokens.slice(colon + 1), mode, external, tag)
			}
			return
		}
		const logical = top.find((i) => ['&&', '||', '??'].includes(tokens[i].value))
		if (logical != null) {
			if (tokens[logical].value !== '&&') visit(tokens.slice(0, logical), mode, external, tag)
			return visit(tokens.slice(logical + 1), mode, external, tag)
		}
		if (
			top.some((i) =>
				['==', '===', '!=', '!==', '<', '>', '<=', '>='].includes(tokens[i].value)
			) &&
			!top.some((i) => tokens[i].value === '(')
		)
			return
		if (tokens[0].kind === 'string' && tokens.length === 1) {
			// JS 转义必须先求值，不能把源码中的反斜杠当作 class 字符改写。
			if (tokens[0].value.includes('\\')) onDynamic()
			if (mode !== 'bindings')
				ranges.push({ start: tokens[0].start + 1, end: tokens[0].end - 1, external })
			return
		}
		if (['[', '{'].includes(tokens[0].value) && tokens[0].close === tokens.at(-1)) {
			for (const part of splitTokens(tokens.slice(1, -1), ',')) {
				if (part[0]?.value === '...') {
					visit(part.slice(1), mode, external, tag)
					continue
				}
				if (tokens[0].value === '[') {
					visit(part, mode, external, tag)
					continue
				}
				const colon = part.findIndex((token) => token.value === ':')
				const field = part[0]?.value
				if (mode === 'bindings') {
					if (field === '[') {
						onDynamic()
						continue
					}
					const classField = ['class', 'hover-class', 'hoverClass'].includes(field)
					if (classField || matchesCustomAttribute(tag, field, customAttributes))
						visit(
							colon < 0 ? part : part.slice(colon + 1),
							classField ? 'class' : 'pt',
							!classField,
							tag
						)
				} else if (mode === 'class') {
					// Vue 对象 class 的键是类名，值是布尔条件。
					if (part[0]?.kind === 'string') visit(part.slice(0, 1), 'class', external, tag)
					else if (part[0]?.value === '[' || part[0]?.value === '...') onDynamic()
				} else if (colon >= 0) visit(part.slice(colon + 1), 'pt', external, tag)
				else visit(part, 'pt', external, tag)
			}
			return
		}
		// 只展开明确的 Vue 响应式容器；其他函数调用不推测参数语义。
		if (['ref', 'shallowRef', 'reactive', 'computed'].includes(tokens[0].value)) {
			const open = top.find((i) => tokens[i].value === '(')
			if (open != null && tokens[open].close === tokens.at(-1))
				return visit(tokens.slice(open + 1, -1), mode, external, tag)
		}
		const name = tokens[0].value
		if (declarations.has(name)) {
			let value = declarations.get(name)
			let remaining = tokens.slice(1)
			if (['reactive', 'shallowReactive'].includes(value[0]?.value)) {
				const open = value.findIndex((token) => token.value === '(')
				if (open > 0 && value[open].close === value.at(-1)) {
					value = value.slice(open + 1, -1)
					if (mode === 'pt') {
						const pt = splitTokens(value.slice(1, -1), ',').find(
							(item) => item[0]?.value === 'pt'
						)
						if (pt) value = pt.slice(2)
					}
				}
			}
			while (remaining.length && ['.', '?.'].includes(remaining[0].value)) {
				const field = remaining[1]?.value
				remaining = remaining.slice(2)
				if (field === 'value') continue
				if (value[0]?.value !== '{') return
				const part = splitTokens(value.slice(1, -1), ',').find(
					(item) => item[0]?.value === field
				)
				if (!part) return
				value = part.slice(2)
			}
			if (!remaining.length) visit(value, mode, external, tag)
			else if (
				remaining[0]?.value === '[' &&
				remaining[0].close === remaining.at(-1) &&
				value[0]?.value === '[' &&
				splitTokens(value.slice(1, -1), ',').every(
					(item) => item.length === 1 && item[0].kind === 'string'
				)
			) {
				// 动态索引静态候选数组时逐项记录 CSS 归属，数组原值保持不变。
				visit(value, mode, external, tag)
			}
		} else onDynamic()
	}
	for (const binding of bindings) {
		if (binding.dynamic)
			visit(
				tokenizeScript(binding.value, binding.start),
				binding.mode,
				binding.external,
				binding.tag
			)
		else ranges.push({ start: binding.start, end: binding.end, external: binding.external })
	}
	// 全局配置、列表项中的显式 PT 字段也可承载 class，必须位于真实对象属性中。
	for (const tokens of scriptTokens) {
		for (let i = 0; i < tokens.length; i++) {
			if (!['{', ','].includes(tokens[i - 1]?.value) || tokens[i + 1]?.value !== ':') continue
			if (!matchesCustomAttribute('*', tokens[i].value, customAttributes)) continue
			let end = i + 2
			while (end < tokens.length && ![',', '}', ';'].includes(tokens[end].value))
				end = nextToken(tokens, end)
			visit(tokens.slice(i + 2, end), 'pt', true)
		}
	}
	return ranges
}

/** 仅对新生成的属性片段转义，已有表达式交由 Vue 保持原始实体语义。 */
function encodeAttribute(value, quote) {
	return value
		.replace(/&/g, '&amp;')
		.replace(new RegExp(quote, 'g'), quote === '"' ? '&quot;' : '&apos;')
}

/** 在绑定处转换类名，保留业务表达式原意，并将辅助函数导入生效的脚本块。 */
export function normalizeClassValues(code, customAttributes, register, filterSource = null) {
	const bindings = collectClassBindings(code, customAttributes)
	if (!bindings.length) return code
	// 已配置入口时，碰撞由入口 CSS 检查，无需为登记再次扫描整个脚本。
	if (register != null)
		for (const { start, end } of collectClassValueRanges(code, customAttributes))
			for (const candidate of code.slice(start, end).match(/\S+/g) ?? []) register(candidate)
	const imported = new Map()
	for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*(['"])(.*?)\2/g)) {
		if (match[3] !== runtimeModule) continue
		for (const alias of match[1].matchAll(
			/(normalizeClass|normalizePt|normalizeBindings)\s+as\s+(\w+)/g
		))
			imported.set(alias[1], alias[2])
	}
	const additions = new Map()
	let output = code
	for (const binding of bindings.reverse()) {
		let value = decodeAttribute(binding.value)
		let encoded = false
		// $attrs 已在父级绑定处转换；原生节点的小程序编译器要求保留此透传入口。
		if (binding.mode === 'bindings' && value.trim() === '$attrs') continue
		if (!binding.dynamic) value = value.replace(/\S+/g, toSafeClassName)
		else {
			const tokens = tokenizeScript(value, 0)
			if (
				[...imported.values()].includes(tokens[0]?.value) &&
				tokens[1]?.value === '(' &&
				tokens[1].close === tokens.at(-1)
			)
				continue
			// 实体由 Vue 按 HTML 属性规则求值，运行时转换保留完整命名实体及数值映射语义。
			const entityExpression = /&(?:#|[A-Za-z])/.test(binding.value)
			let dynamic = entityExpression
			// 不含实体的表达式沿用静态分析，普通逻辑运算不会额外引入运行时调用。
			const ranges = dynamic
				? []
				: collectClassValueRanges(
						value,
						customAttributes,
						() => {
							dynamic = true
						},
						[{ ...binding, start: 0, end: value.length, value }]
					)
			if (!dynamic) {
				for (const { start, end } of ranges.sort((a, b) => b.start - a.start))
					value =
						value.slice(0, start) +
						value.slice(start, end).replace(/\S+/g, toSafeClassName) +
						value.slice(end)
			} else {
				const helper =
					binding.mode === 'bindings'
						? 'normalizeBindings'
						: binding.mode === 'pt'
							? 'normalizePt'
							: 'normalizeClass'
				let alias = imported.get(helper) ?? additions.get(helper)
				if (alias == null) {
					const base = `__tw${helper === 'normalizeBindings' ? 'Bindings' : helper === 'normalizePt' ? 'Pt' : 'Class'}`
					alias = base
					for (let suffix = 1; new RegExp(`\\b${alias}\\b`).test(code); suffix++)
						alias = `${base}${suffix}`
					additions.set(helper, alias)
				}
				const rules = [
					...(customAttributes?.['*'] ?? []),
					...(customAttributes?.[binding.tag] ?? [])
				]
				const params = rules
					.map((rule) =>
						typeof rule === 'string' ? JSON.stringify(rule) : rule.toString()
					)
					.join(', ')
				// 实体可能解码出逗号等运算符，整体分组后仍然只传入一个求值结果。
				let groupArgument = entityExpression
				for (let i = 0; !groupArgument && i < tokens.length; i = nextToken(tokens, i))
					groupArgument = tokens[i].value === ','
				const argument = groupArgument ? `(${binding.value})` : binding.value
				// 原表达式已经处于属性引号内，只转义新增参数，避免把 &copy; 变成 &amp;copy;。
				value = `${alias}(${argument}${binding.mode === 'bindings' ? `, [${encodeAttribute(params, binding.quote)}]` : ''})`
				encoded = true
			}
		}
		if (!encoded) value = encodeAttribute(value, binding.quote)
		if (binding.shorthand)
			value = `${binding.attribute}=${binding.quote}${value}${binding.quote}`
		output = output.slice(0, binding.start) + value + output.slice(binding.end)
	}
	if (additions.size) {
		const imports = [...additions].map(([helper, alias]) => `${helper} as ${alias}`).join(', ')
		const statement = `\nimport { ${imports} } from ${JSON.stringify(runtimeModule)}\n`
		// 平台过滤保留原始偏移，只将导入写入当前构建实际启用的脚本块。
		const scripts = scanSfc(filterSource == null ? output : filterSource(output)).filter(
			(block) => block.name === 'script'
		)
		const setup = scripts.find((block) =>
			[...block.attributes.matchAll(attributePattern)].some(
				(attribute) => attribute[1] === 'setup'
			)
		)
		if (setup) {
			output = setup.selfClosing
				? output.slice(0, setup.contentStart - 2) +
					'>' +
					statement +
					'</script>' +
					output.slice(setup.end)
				: output.slice(0, setup.contentStart) + statement + output.slice(setup.contentStart)
		} else {
			const script = scripts[0]
			const lang = script
				? ([...script.attributes.matchAll(attributePattern)].find(
						(attribute) => attribute[1] === 'lang'
					)?.[0] ?? '')
				: ' lang="ts"'
			output += `\n<script setup${lang}>${statement}</script>`
		}
	}
	return output
}

/** 解码数值实体及属性中常用的命名实体；不执行表达式或引入浏览器 DOM。 */
function decodeAttribute(value) {
	if (!value.includes('&')) return value
	const named = {
		amp: '&',
		AMP: '&',
		quot: '"',
		QUOT: '"',
		apos: "'",
		lt: '<',
		LT: '<',
		gt: '>',
		GT: '>',
		nbsp: '\u00a0',
		Tab: '\t',
		NewLine: '\n'
	}
	return value.replace(
		/&(?:#(x[\da-f]+|\d+);?|(amp|AMP|quot|QUOT|apos|lt|LT|gt|GT|nbsp|Tab|NewLine);)/gi,
		(full, number, name) => {
			if (number == null) return named[name] ?? full
			const point = Number.parseInt(number.replace(/^x/i, ''), /^x/i.test(number) ? 16 : 10)
			return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
				? String.fromCodePoint(point)
				: '\ufffd'
		}
	)
}

/** 为候选扫描提供已解码的属性值，脚本数据与磁盘源码保持原样。 */
export function decodeClassAttributeValues(code, customAttributes = {}) {
	if (!/&(?:#|[A-Za-z]+;)/.test(code)) return code
	let output = code
	for (const binding of collectClassBindings(code, customAttributes).reverse()) {
		if (binding.shorthand) continue
		const value = decodeAttribute(binding.value)
		if (value !== binding.value)
			output = output.slice(0, binding.start) + value + output.slice(binding.end)
	}
	return output
}

/** 只读取真实模板属性，跳过脚本、样式、注释和业务字符串中的 HTML。 */
function collectClassBindings(code, customAttributes = {}) {
	if (!code.trimStart().startsWith('<')) return []
	const markup = code.replace(
		/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi,
		(text) => ' '.repeat(text.length)
	)
	const bindings = []
	const pattern = new RegExp(tagPattern)
	let preTag = null
	let preDepth = 0
	for (let match = pattern.exec(markup); match != null; match = pattern.exec(markup)) {
		if (match[1] == null) {
			// 插值文案不参与改写；v-pre 中的花括号是普通文本，继续扫描其中的真实标签。
			if (preTag != null) pattern.lastIndex = match.index + 2
			continue
		}
		const tag = match[1].toLowerCase()
		if (match[0].startsWith('</')) {
			if (tag === preTag && --preDepth === 0) preTag = null
			continue
		}
		const attributes = [...match[0].matchAll(attributePattern)]
		if (!match[0].endsWith('/>') && !voidTags.has(match[1])) {
			if (tag === preTag) preDepth++
			else if (preTag == null && attributes.some((attr) => attr[1] === 'v-pre')) {
				preTag = tag
				preDepth = 1
			}
		}
		for (const attr of attributes) {
			// 完整消费事件、指令及其值后再分类，不能进入业务字符串继续寻找伪属性。
			if (attr[4] != null) continue
			const name = attr[1].replace(/^(?:v-bind:|:)/, '')
			const classAttribute = ['class', 'hover-class', 'hoverClass'].includes(name)
			const external =
				!classAttribute && matchesCustomAttribute(match[1], name, customAttributes)
			if (!classAttribute && name !== 'v-bind' && !external) continue
			const dynamic =
				attr[1].startsWith(':') || attr[1].startsWith('v-bind:') || name === 'v-bind'
			const shorthand = attr[2] == null
			if (shorthand && (!dynamic || name === 'v-bind')) continue
			const start =
				match.index +
				attr.index +
				(shorthand ? attr[0].indexOf(attr[1]) : attr[0].indexOf(attr[2]) + 1)
			const value = shorthand
				? name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
				: attr[3]
			bindings.push({
				start,
				end: start + (shorthand ? attr[1].length : value.length),
				value,
				quote: attr[2] ?? '"',
				shorthand,
				attribute: attr[1],
				tag: match[1],
				dynamic,
				mode: name === 'v-bind' ? 'bindings' : external ? 'pt' : 'class',
				external
			})
		}
	}
	return bindings
}

function matchesCustomAttribute(tag, name, attributes) {
	return [...(attributes['*'] ?? []), ...(tag === '*' ? [] : (attributes[tag] ?? []))].some(
		(rule) => {
			if (typeof rule === 'string') return rule === name
			rule.lastIndex = 0
			return rule.test(name)
		}
	)
}

function nextToken(tokens, index) {
	const close = tokens[index]?.close
	const end = close ? tokens.indexOf(close, index + 1) : -1
	return end >= 0 ? end + 1 : index + 1
}

function endsExpression(code, tokens, index) {
	if (!/[\r\n]/.test(code.slice(tokens[index - 1].end, tokens[index].start))) return false
	const previous = tokens[index - 1].value
	const current = tokens[index].value
	return (
		!['=', '=>', '?', ':', '&&', '||', '??', '+', '-', '*', '/', ',', '.', '?.'].includes(
			previous
		) &&
		!['?', ':', '&&', '||', '??', '+', '-', '*', '/', '.', '?.', 'as', 'satisfies'].includes(
			current
		)
	)
}

function splitTokens(tokens, separator) {
	const parts = []
	let start = 0
	for (let i = 0; i < tokens.length; i = nextToken(tokens, i)) {
		if (tokens[i].value !== separator) continue
		parts.push(tokens.slice(start, i))
		start = i + 1
	}
	parts.push(tokens.slice(start))
	return parts
}

/** 词法边界用于安全跳过注释和业务字符串；不执行源码。 */
export function tokenizeScript(source, offset = 0, onComment = null) {
	const tokens = []
	const pattern =
		/\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$-]*|\d+(?:\.\d+)?|===|!==|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\.\.\.|[^\s]/g
	const stack = []
	let skipUntil = 0
	for (const match of source.matchAll(pattern)) {
		if (match.index < skipUntil) continue
		const text = match[0]
		if (/^\s/.test(text)) continue
		if (/^\/\/|^\/\*|^<!--/.test(text)) {
			onComment?.(text, offset + match.index, offset + match.index + text.length)
			continue
		}
		// 正则中的 import/class 等字样不是代码；按表达式起点识别并跳过完整字面量。
		const previous = tokens.at(-1)?.value
		if (
			text === '/' &&
			(previous == null ||
				[
					'=',
					'(',
					'[',
					'{',
					',',
					':',
					';',
					'!',
					'&&',
					'||',
					'??',
					'?',
					'=>',
					'return',
					'case'
				].includes(previous))
		) {
			let bracket = false
			for (let end = match.index + 1; end < source.length; end++) {
				if (source[end] === '\\') {
					end++
					continue
				}
				if (source[end] === '\n' || source[end] === '\r') break
				if (source[end] === '[') bracket = true
				else if (source[end] === ']') bracket = false
				else if (source[end] === '/' && !bracket) {
					skipUntil = end + 1
					while (/[a-z]/i.test(source[skipUntil] ?? '') && skipUntil < source.length)
						skipUntil++
					tokens.push({
						value: source.slice(match.index, skipUntil),
						kind: 'regex',
						start: offset + match.index,
						end: offset + skipUntil
					})
					break
				}
			}
			if (skipUntil > match.index) continue
		}
		const quoted = text[0] === '"' || text[0] === "'"
		const token = {
			value: quoted ? text.slice(1, -1) : text,
			kind: quoted ? 'string' : 'token',
			start: offset + match.index,
			end: offset + match.index + text.length
		}
		tokens.push(token)
		if (['(', '[', '{'].includes(text)) stack.push(token)
		else if ([')', ']', '}'].includes(text)) {
			const open = stack.pop()
			if (open) open.close = token
		}
	}
	return tokens
}
