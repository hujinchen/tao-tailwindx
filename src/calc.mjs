const whitespace = /[\t\n\f\r ]/
const units = new Set(
	'px rpx rem em ex ch cap ic lh rlh vw vh vi vb vmin vmax svw svh lvw lvh dvw dvh cm mm q in pt pc %'.split(
		' '
	)
)

// 只消费完整表达式；任一子式不确定时，不改写其内部的静态片段。
function evaluate(expression) {
	let position = 0
	const skip = () => {
		while (whitespace.test(expression[position] ?? '')) position++
	}
	function primary(depth) {
		if (depth > 64) return null
		skip()
		const nested = expression.slice(position).match(/^(?:calc)?\(/i)
		if (nested) {
			position += nested[0].length
			const value = sum(depth + 1)
			skip()
			if (expression[position++] !== ')') return null
			return value
		}
		const match = expression.slice(position).match(/^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?/i)
		if (!match) return null
		position += match[0].length
		const unit = expression.slice(position).match(/^(?:[a-z]+|%)/i)?.[0] ?? ''
		position += unit.length
		const number = Number(match[0])
		if (!Number.isFinite(number) || (unit && !units.has(unit.toLowerCase()))) return null
		return { number, unit: unit.toLowerCase() }
	}
	function product(depth) {
		let left = primary(depth)
		while (left) {
			skip()
			const operator = expression[position]
			if (operator !== '*' && operator !== '/') break
			position++
			const right = primary(depth)
			if (
				!right ||
				(operator === '*' && left.unit && right.unit) ||
				(operator === '/' && (right.unit || right.number === 0))
			)
				return null
			left = {
				number: operator === '*' ? left.number * right.number : left.number / right.number,
				unit: left.unit || right.unit
			}
			if (!Number.isFinite(left.number)) return null
		}
		return left
	}
	function sum(depth) {
		let left = product(depth)
		while (left) {
			skip()
			const operator = expression[position]
			if (operator !== '+' && operator !== '-') break
			if (
				!whitespace.test(expression[position - 1] ?? '') ||
				!whitespace.test(expression[position + 1] ?? '')
			)
				return null
			position++
			const right = product(depth)
			if (!right || left.unit !== right.unit) return null
			left = {
				number: operator === '+' ? left.number + right.number : left.number - right.number,
				unit: left.unit
			}
			if (!Number.isFinite(left.number)) return null
		}
		return left
	}
	const value = sum(0)
	skip()
	return position === expression.length ? value : null
}

// 字符串、注释、URL 和未知函数整体跳过，避免把文本当 CSS 数学式。
export function foldCalculations(value, property = '') {
	property = property.toLowerCase()
	// 变量尚无最终属性，不能提前丢失 calc 的钳制、取整和百分比语义。
	if (property.startsWith('--')) return value
	let output = ''
	for (let index = 0; index < value.length;) {
		const start = index
		const quote = value[index]
		if (quote === '"' || quote === "'") {
			index++
			while (index < value.length) {
				if (value[index] === '\\') index += 2
				else if (value[index++] === quote) break
			}
		} else if (value.startsWith('/*', index)) {
			const end = value.indexOf('*/', index + 2)
			index = end < 0 ? value.length : end + 2
		} else {
			const token = value.slice(index).match(/^[\w%#.\\\u0080-\uffff+-]+/)
			if (!token) {
				output += value[index++]
				continue
			}
			index += token[0].length
			if (value[index] === '(') {
				let depth = 1
				let string = null
				const opening = index++
				while (index < value.length && depth > 0) {
					const character = value[index++]
					if (character === '\\') {
						index++
						continue
					}
					if (string) {
						if (character === string) string = null
						continue
					}
					if (character === '"' || character === "'") string = character
					else if (character === '/' && value[index] === '*') {
						const end = value.indexOf('*/', index + 1)
						index = end < 0 ? value.length : end + 2
					} else if (character === '(') depth++
					else if (character === ')') depth--
				}
				if (depth === 0 && token[0].toLowerCase() === 'calc') {
					const expression = value.slice(opening + 1, index - 1)
					const infinity = expression.match(/^infinity\s*\*\s*1(px|rpx)$/)
					if (infinity) {
						output += `9999${infinity[1]}`
						continue
					}
					const result = evaluate(expression)
					if (
						result &&
						// calc 的负值钳制和整数取整不能变成无效的裸声明。
						!(
							result.number < 0 &&
							!/^(?:margin(?:-|$)|top$|right$|bottom$|left$|inset(?:-|$)|translate$|text-indent$|letter-spacing$|word-spacing$)/.test(
								property
							)
						) &&
						!(
							/^(?:z-index|order|column-count|orphans|widows)$/.test(property) &&
							!Number.isInteger(result.number)
						) &&
						!(result.unit === '%' && /radius$/i.test(property))
					) {
						output += `${Number(result.number.toFixed(6))}${result.unit}`
						continue
					}
				}
			} else if (/^3\.40282e38(?:px|rpx)$/.test(token[0])) {
				output += token[0].replace('3.40282e38', '9999')
				continue
			}
		}
		output += value.slice(start, index)
	}
	return output
}
