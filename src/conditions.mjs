import { tokenizeScript } from './class-values.mjs'
import { scanSfc } from './sfc.mjs'

/** 固定本次插件的平台上下文，沿用 SDK 的自定义宏、UTS 目标与 Vapor 环境标记。 */
export function createConditionContext(platform) {
	const context = { [platform.replace(/-/g, '_').toUpperCase()]: true }
	const app = platform === 'app' || platform.startsWith('app-')
	context.APP = app
	context.APP_UVUE = app
	if (platform === 'app' && process.env.UNI_UTS_PLATFORM)
		context[process.env.UNI_UTS_PLATFORM.replace(/-/g, '_').toUpperCase()] = true
	context.WEB = context.H5 = platform === 'web' || platform === 'h5'
	context.MP = platform.startsWith('mp-')
	for (const [name, value] of Object.entries(JSON.parse(process.env.UNI_CUSTOM_CONTEXT || '{}')))
		context[name.replace(/-/g, '_').toUpperCase()] = !!value
	context.UNI_APP_X = context.VUE3 = true
	context.VUE3_VAPOR = process.env.UNI_APP_X_DOM2 === 'true'
	context.APP_HARMONY_JSVM =
		platform === 'app-harmony' &&
		context.VUE3_VAPOR &&
		process.env.UNI_APP_X_HARMONY_SCRIPT_ENGINE === 'jsvm'
	context.UNIVERSION = Number.parseFloat(process.env.UNI_COMPILER_VERSION) || 0
	return context
}

/** 只解释条件表达式，不执行源码；比较、括号与逻辑运算按优先级求值。 */
function evaluateCondition(expression, context) {
	const tokens =
		expression.match(/&&|\|\||===|!==|==|!=|>=|<=|[()!<>]|-?\d+(?:\.\d+)?|[A-Za-z_][\w-]*/g) ??
		[]
	const invalid = () => new Error(`[uniappx-tailwind] 无效的条件编译表达式：${expression}`)
	if (tokens.join('') !== expression.replace(/\s/g, '')) throw invalid()
	let cursor = 0
	function atom() {
		const token = tokens[cursor++]
		if (token === '!') return !atom()
		if (token === '(') {
			const value = or()
			if (tokens[cursor++] !== ')') throw invalid()
			return value
		}
		if (token == null || !/^[\w-]+(?:\.\d+)?$/.test(token)) throw invalid()
		if (/^-?\d/.test(token)) return Number(token)
		if (token === 'true' || token === 'false') return token === 'true'
		return context[token.replace(/-/g, '_').toUpperCase()] ?? false
	}
	function comparison() {
		const left = atom()
		const operator = tokens[cursor]
		if (!['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(operator)) return left
		cursor++
		const right = atom()
		switch (operator) {
			case '==':
				return left == right
			case '===':
				return left === right
			case '!=':
				return left != right
			case '!==':
				return left !== right
			case '>':
				return left > right
			case '>=':
				return left >= right
			case '<':
				return left < right
			case '<=':
				return left <= right
		}
	}
	function and() {
		let value = comparison()
		while (tokens[cursor] === '&&') {
			cursor++
			const next = comparison()
			value = value && next
		}
		return value
	}
	function or() {
		let value = and()
		while (tokens[cursor] === '||') {
			cursor++
			const next = and()
			value = value || next
		}
		return value
	}
	const result = or()
	if (cursor !== tokens.length) throw invalid()
	return !!result
}

/** 按注释边界过滤条件分支，使用等长空白保留 SFC 块与源码的偏移对应关系。 */
function filterCommentConditions(source, context, file, scanComments) {
	const parts = []
	const stack = [true]
	let cursor = 0
	scanComments(source, (comment, start, end) => {
		const directive = comment.match(
			/^(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef|if|endif)\b([\s\S]*?)(?:\*\/|-->)?$/i
		)
		if (directive == null) return
		const preceding = source.slice(cursor, start)
		parts.push(stack.at(-1) ? preceding : preceding.replace(/[^\r\n]/g, ' '))
		parts.push(source.slice(start, end).replace(/[^\r\n]/g, ' '))
		cursor = end
		const name = directive[1].toLowerCase()
		if (name === 'endif') {
			if (stack.length === 1) throw new Error(`[uniappx-tailwind] 多余的 #endif：${file}`)
			stack.pop()
		} else {
			const matched = evaluateCondition(directive[2].trim(), context)
			stack.push(stack.at(-1) && (name === 'ifndef' ? !matched : matched))
		}
	})
	if (stack.length !== 1) throw new Error(`[uniappx-tailwind] 未闭合的条件编译：${file}`)
	parts.push(source.slice(cursor))
	return parts.join('')
}

/** HTML 与脚本分别识别条件注释，避免模板文案的引号干扰 JavaScript 词法边界。 */
export function filterConditions(source, context, file = '') {
	if (!/#(?:ifdef|ifndef|if|endif)\b/i.test(source)) return source
	const scanScriptComments = (content, callback) => tokenizeScript(content, 0, callback)
	if (!/\.(?:uvue|vue)$/i.test(file))
		return filterCommentConditions(source, context, file, scanScriptComments)
	let output = filterCommentConditions(source, context, file, scanSfc)
	for (const block of scanSfc(output)) {
		if (!['script', 'style'].includes(block.name)) continue
		const content = output.slice(block.contentStart, block.contentEnd)
		const filtered = filterCommentConditions(content, context, file, scanScriptComments)
		output = output.slice(0, block.contentStart) + filtered + output.slice(block.contentEnd)
	}
	return output
}
