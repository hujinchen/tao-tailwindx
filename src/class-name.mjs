// 保留可读短名；任意负值和小数使用标记，构建阶段单独检测碰撞。
export function toSafeClassName(className) {
	if (/^[a-zA-Z0-9_-]*$/.test(className)) return className
	const important = className.endsWith('!')
	const normalized = (important ? className.slice(0, -1) : className)
		.replace(/\[-(?=\d|\.\d)/g, '[neg-')
		.replace(/%/g, '-percent')
		.replace(/\.(?=\d)/g, 'dot')
		.replace(/[^a-zA-Z0-9_-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/-$/g, '')
	return important ? `${normalized}-important` : normalized
}

/** 同一次编译内的不同原名不得共享安全类名，包含与普通自定义 class 的碰撞。 */
export function createClassNameRegistry() {
	const names = new Map()
	return (candidate) => {
		const safe = toSafeClassName(candidate)
		const previous = names.get(safe)
		if (previous != null && previous !== candidate)
			throw new Error(
				`[uniappx-tailwind] 类名碰撞：${JSON.stringify(previous)} 与 ${JSON.stringify(candidate)} 均映射为 ${JSON.stringify(safe)}`
			)
		names.set(safe, candidate)
	}
}

// CSS 的十六进制转义可带一个空白终止符；模板和 PT 输入不应执行 CSS 解码。
export function decodeCssClassName(className) {
	return className.replace(
		/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[\t\n\f\r ])?|(\r\n|[\n\f\r])|([^\n\f\r]))/g,
		(_, hex, newline, character) => {
			if (hex != null) {
				const code = parseInt(hex, 16)
				return String.fromCodePoint(
					code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
						? 0xfffd
						: code
				)
			}
			return newline != null ? '' : character
		}
	)
}
