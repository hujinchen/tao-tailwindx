import { tokenizeScript } from './class-values.mjs'

/** 仅收集运行时模块边，不执行脚本，也不根据 class 值推断消费者。 */
export function collectScriptImports(source) {
	const tokens = tokenizeScript(source)
	const imports = new Set()
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		if (token.kind !== 'token' || !['import', 'export'].includes(token.value)) continue
		if (['.', '?.'].includes(tokens[i - 1]?.value)) continue
		const next = tokens[i + 1]
		if (next?.value === 'type' && tokens[i + 2]?.value !== 'from') continue
		if (token.value === 'import' && next?.value === '(') {
			if (tokens[i - 1]?.value === 'typeof') continue
			if (tokens[i + 2]?.kind === 'string' && [')', ','].includes(tokens[i + 3]?.value))
				imports.add(tokens[i + 2].value)
			continue
		}
		if (token.value === 'import' && next?.kind === 'string') {
			imports.add(next.value)
			continue
		}
		// 跳过默认导出表达式、声明和 import.meta，避免把后续语句误连为来源。
		if (!next || (token.value === 'export' && !['*', '{'].includes(next.value))) continue
		if (next.value === '.') continue
		let cursor = i + 1
		let runtime = next.value !== '{'
		for (; cursor < tokens.length; cursor++) {
			const current = tokens[cursor]
			if ([';', '=', 'import', 'export'].includes(current.value)) break
			if (current.value === '{' && current.close) {
				const end = tokens.indexOf(current.close, cursor + 1)
				const members = tokens.slice(cursor + 1, end)
				for (let j = 0; j < members.length; j++) {
					if (j > 0 && members[j - 1].value !== ',') continue
					if (
						members[j].value !== 'type' ||
						members[j + 1] == null ||
						['as', ','].includes(members[j + 1]?.value)
					)
						runtime = true
				}
				cursor = end
				continue
			}
			if (current.value === 'from' && tokens[cursor + 1]?.kind === 'string') {
				if (runtime) imports.add(tokens[cursor + 1].value)
				break
			}
		}
	}
	return imports
}
