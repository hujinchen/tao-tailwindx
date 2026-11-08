export const voidTags = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
])

/** 只读取真实顶层 SFC 块；属性、注释及原始文本中的标签不参与块选择。 */
export function scanSfc(source, onComment = null) {
	const pattern =
		/\{\{[\s\S]*?\}\}|<!--[\s\S]*?-->|<![^>]*>|<\/?([A-Za-z][\w:.-]*)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/g
	const blocks = []
	const stack = []
	let block = null
	for (let match = pattern.exec(source); match != null; match = pattern.exec(source)) {
		const text = match[0]
		if (text.startsWith('<!--')) {
			onComment?.(text, match.index, pattern.lastIndex)
			continue
		}
		if (match[1] == null) continue
		const name = match[1].toLowerCase()
		if (text.startsWith('</')) {
			if (stack.at(-1) !== name) continue
			stack.pop()
			if (stack.length === 0 && block != null) {
				block.contentEnd = match.index
				block.end = pattern.lastIndex
				blocks.push(block)
				block = null
			}
			continue
		}
		const selfClosing = text.endsWith('/>')
		if (stack.length === 0) {
			block = {
				name,
				attributes: text.slice(1 + match[1].length, selfClosing ? -2 : -1),
				start: match.index,
				end: pattern.lastIndex,
				contentStart: pattern.lastIndex,
				contentEnd: pattern.lastIndex,
				selfClosing
			}
		}
		if (selfClosing || voidTags.has(name)) {
			if (stack.length === 0) {
				blocks.push(block)
				block = null
			}
			continue
		}
		// script/style 和自定义块按 Vue 的原始文本边界消费，不解析其中的示例标签。
		if (
			['script', 'style', 'textarea', 'title'].includes(name) ||
			(stack.length === 0 && name !== 'template')
		) {
			const closing = new RegExp(`</${name.replace(/\./g, '\\.')}\\s*>`, 'gi')
			closing.lastIndex = pattern.lastIndex
			const end = closing.exec(source)
			if (end == null) break
			pattern.lastIndex = closing.lastIndex
			if (stack.length === 0) {
				block.contentEnd = end.index
				block.end = closing.lastIndex
				blocks.push(block)
				block = null
			}
			continue
		}
		stack.push(name)
	}
	return blocks
}
