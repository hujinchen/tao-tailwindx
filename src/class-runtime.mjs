import { toSafeClassName } from './class-name.mjs'

/** 在节点绑定处转换 Vue class，条件值和传入数组、对象均保持不变。 */
export function normalizeClass(value) {
	if (typeof value === 'string')
		return /^[a-zA-Z0-9_\s-]*$/.test(value) ? value : value.replace(/\S+/g, toSafeClassName)
	if (Array.isArray(value)) return value.map(normalizeClass).filter(Boolean).join(' ')
	if (value != null && typeof value === 'object') {
		const classes = []
		for (const key in value) if (value[key]) classes.push(normalizeClass(key))
		return classes.join(' ')
	}
	return ''
}

/** PT 只复制发生转换的路径，保留原配置和未变化的嵌套引用。 */
export function normalizePt(value) {
	if (typeof value === 'string') return normalizeClass(value)
	if (value == null || typeof value !== 'object') return value
	let result = value
	for (const key of Object.keys(value)) {
		const normalized = normalizePt(value[key])
		if (normalized === value[key]) continue
		if (result === value) result = Array.isArray(value) ? [...value] : { ...value }
		result[key] = normalized
	}
	return result
}

/** v-bind 仅转换明确的样式属性，业务字段、事件和原对象保持不变。 */
export function normalizeBindings(value, customAttributes) {
	if (value == null || typeof value !== 'object') return value
	let result = value
	for (const key of Object.keys(value)) {
		let normalize = null
		if (key === 'class' || key === 'hover-class' || key === 'hoverClass')
			normalize = normalizeClass
		else if (
			customAttributes.some((rule) => {
				if (typeof rule === 'string') return rule === key
				rule.lastIndex = 0
				return rule.test(key)
			})
		)
			normalize = normalizePt
		else continue
		const normalized = normalize(value[key])
		if (normalized === value[key]) continue
		if (result === value) result = { ...value }
		result[key] = normalized
	}
	return result
}
