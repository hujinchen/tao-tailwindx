import postcss from 'postcss'
import { foldCalculations } from './calc.mjs'
import { decodeCssClassName, toSafeClassName } from './class-name.mjs'

const unsupportedAtRules = new Set(['property', 'media', 'supports'])
const unsupportedDeclarations = new Set([
	'animation',
	'animation-delay',
	'animation-direction',
	'animation-duration',
	'animation-fill-mode',
	'animation-iteration-count',
	'animation-name',
	'animation-play-state',
	'animation-timing-function',
	'content',
	'resize'
])
const unsupportedDisplayValues = new Set(['block', 'grid', 'table'])
const logicalProperties = new Map([
	['margin-inline', ['margin-left', 'margin-right']],
	['margin-block', ['margin-top', 'margin-bottom']],
	['padding-inline', ['padding-left', 'padding-right']],
	['padding-block', ['padding-top', 'padding-bottom']]
])
const invalidCssValuePattern = /(?:^|[\s,(])#\.\.\.(?=$|[\s,)])/

export function sanitize(css, options = {}, from = undefined) {
	const root = css.type === 'root' ? css.clone() : postcss.parse(css, { from })
	// Vue 不会同步改写变量内的动画名；只还原该模块编译边界确认的 Tailwind 关键帧。
	if (options.scopeId && options.tailwindKeyframes?.size > 0) {
		const suffix = `-${options.scopeId}`
		const names = new Map()
		root.walkAtRules(/^(?:-webkit-)?keyframes$/, (node) => {
			if (!node.params.endsWith(suffix)) return
			const name = node.params.slice(0, -suffix.length)
			if (!options.tailwindKeyframes.has(name)) return
			names.set(node.params, name)
			node.params = name
		})
		if (names.size > 0)
			root.walkDecls(/^(?:-webkit-)?animation(?:-name)?$/, (node) => {
				node.value = postcss.list
					.comma(node.value)
					.map((animation) =>
						postcss.list
							.space(animation)
							.map((part) => names.get(part) ?? part)
							.join(' ')
					)
					.join(', ')
			})
	}
	if (options.foldCalculations && options.nativeCss !== false)
		root.walkDecls((declaration) => {
			declaration.value = foldCalculations(declaration.value, declaration.prop)
		})
	const channelVariables = new Set()
	if (options.nativeCss !== false) {
		// 只保护输入中已有的通道；本轮生成的通道不能阻挡后续同名变量覆盖。
		const existingChannels = new Map()
		root.walkDecls(/-rgb$/, (node) => {
			const names = existingChannels.get(node.parent) ?? new Set()
			names.add(node.prop)
			existingChannels.set(node.parent, names)
		})
		injectThemeColorChannels(
			root,
			options.colorVariables ?? [],
			channelVariables,
			existingChannels
		)
		injectAliasColorChannels(root, channelVariables, existingChannels)
	}
	sanitizeContainer(root, {
		registerClassName: options.registerCssClassName,
		channelVariables,
		strict: options.strict ?? true,
		// Vapor 5.31+ 支持 CSS 动画；拍平节点的限制由平台负责校验。
		removeKeyframes: options.removeKeyframes ?? false,
		removeAnimations: options.removeAnimations ?? false,
		nativeCss: options.nativeCss ?? true,
		colorVariablePatterns: options.colorVariables ?? [],
		preserveMedia: options.preserveMedia ?? false,
		allowEscapedSelectors: options.allowEscapedSelectors ?? false,
		allowDarkVariantSelectors: options.allowDarkVariantSelectors ?? false,
		preserveColorSchemeMedia: options.preserveColorSchemeMedia ?? false,
		preserveVueScope: options.preserveVueScope ?? false,
		rootSelector: options.rootSelector ?? 'page',
		preserveDeclarations: options.preserveDeclarations ?? new Map(),
		preserveAllValues: options.preserveAllValues ?? false
	})
	return root
}

function sanitizeContainer(container, config) {
	for (const node of [...(container.nodes ?? [])]) {
		if (node.type === 'atrule') {
			const name = node.name.toLowerCase()
			if (name === 'keyframes' || name === '-webkit-keyframes') {
				if (config.removeKeyframes) node.remove()
				else node.walkRules((frame) => sanitizeNestedDeclarations(frame, config))
				continue
			}
			if (
				name === 'media' &&
				(config.preserveMedia ||
					(config.preserveColorSchemeMedia && isColorSchemeMedia(node.params)))
			) {
				node.params = normalizeTailwindValue(node.params, config)
				if (node.nodes) sanitizeContainer(node, config)
				if (!node.nodes?.length) node.remove()
				continue
			}
			if (unsupportedAtRules.has(name) && config.nativeCss) {
				node.remove()
				continue
			}
			if (name === 'layer') {
				if (node.nodes) {
					sanitizeContainer(node, config)
					node.replaceWith(...node.nodes)
				} else {
					node.remove()
				}
				continue
			}
			node.params = normalizeTailwindValue(node.params, config)
			if (node.nodes) sanitizeContainer(node, config)
			if (node.nodes) sanitizeNestedDeclarations(node, config)
			continue
		}
		if (node.type !== 'rule') continue

		const allowedSelectors = postcss.list
			.comma(node.selector)
			.map((selector) => {
				const normalized = normalizeEscapedSelector(
					config.preserveVueScope ? selector : removeVueScope(selector),
					config.registerClassName
				)
				return {
					selector: normalized,
					validationSelector: config.preserveVueScope
						? removeVueScope(normalized)
						: normalized,
					preserveValues: selector.includes('\\[') || selector.includes('\\]')
				}
			})
			.filter(
				({ selector, validationSelector }) =>
					isRootSelector(validationSelector) ||
					!config.strict ||
					isVaporClassSelector(validationSelector, config.allowEscapedSelectors) ||
					(config.allowDarkVariantSelectors && isDarkVariantSelector(validationSelector))
			)
		if (allowedSelectors.length === 0) {
			node.remove()
			continue
		}

		const selectors = allowedSelectors.flatMap(
			({ selector, validationSelector, preserveValues }) =>
				(isRootSelector(validationSelector)
					? [config.rootSelector ?? 'page']
					: [selector]
				).map((value) => ({
					selector: value,
					preserveValues
				}))
		)
		const groups = new Map()
		for (const item of selectors) {
			const key = item.preserveValues ? 'arbitrary' : 'standard'
			const group = groups.get(key) ?? []
			group.push(item.selector)
			groups.set(key, group)
		}
		const rules = [...groups.entries()]
			.map(([key, group]) => {
				const rule = groups.size === 1 ? node : node.clone()
				rule.selector = group.join(',')
				sanitizeNestedDeclarations(rule, config, key === 'arbitrary')
				return rule.nodes?.some((child) => child.type === 'decl' || child.type === 'atrule')
					? rule
					: null
			})
			.filter((rule) => rule != null)
		if (rules.length === 0) node.remove()
		else if (rules[0] !== node) node.replaceWith(...rules)
	}
}

function isRootSelector(selector) {
	return selector === ':root' || selector === 'page'
}

function isColorSchemeMedia(params) {
	return /^\(\s*prefers-color-scheme\s*:\s*(?:light|dark)\s*\)$/i.test(params.trim())
}

function sanitizeNestedDeclarations(container, config, preserveValues = false) {
	// Tailwind v4 的阴影工具类依赖通配规则初始化的变量；App 会过滤通配选择器，
	// 因此将同一工具类生成的阴影值直接写入 box-shadow。
	if (config.nativeCss) {
		const shadow = (container.nodes ?? []).find(
			(node) => node.type === 'decl' && node.prop === '--tw-shadow'
		)
		if (shadow?.type === 'decl') {
			let hasBoxShadow = false
			for (const node of container.nodes ?? []) {
				if (node.type === 'decl' && node.prop === 'box-shadow') {
					hasBoxShadow = true
					if (node.value.includes('--tw-shadow')) node.value = shadow.value
				}
			}
			if (!hasBoxShadow) {
				container.append({ prop: 'box-shadow', value: shadow.value })
			}
		}
	}
	// Tailwind backdrop 工具类使用规则内变量组合；App 不支持这些空回退占位链。
	if (config.nativeCss) {
		const localVariables = new Map(
			(container.nodes ?? [])
				.filter((node) => node.type === 'decl' && node.prop.startsWith('--tw-backdrop-'))
				.map((node) => [node.prop, node.value])
		)
		for (const node of container.nodes ?? []) {
			if (node.type !== 'decl' || node.prop !== 'backdrop-filter') continue
			node.value = node.value
				.replace(
					/var\((--tw-backdrop-[\w-]+),\s*\)/g,
					(full, name) => localVariables.get(name) ?? ''
				)
				.trim()
			if (node.value.length === 0) node.remove()
		}
	}
	for (const node of [...(container.nodes ?? [])]) {
		if (node.type === 'decl') {
			sanitizeDeclaration(node, config, preserveValues)
		} else if (node.type === 'atrule') {
			if (
				node.name.toLowerCase() === 'media' &&
				!config.preserveMedia &&
				!(config.preserveColorSchemeMedia && isColorSchemeMedia(node.params))
			) {
				node.remove()
				continue
			}
			if (node.name.toLowerCase() === 'supports' && config.nativeCss) {
				if (isColorMixSupport(node.params) && container.type === 'rule') {
					applyColorMixDeclarations(node, config)
				}
				node.remove()
				continue
			}
			node.params = normalizeTailwindValue(node.params, config)
			if (node.nodes) sanitizeNestedDeclarations(node, config, preserveValues)
		}
	}
}

function isColorMixSupport(params) {
	return /^\(\s*color\s*:\s*color-mix\(/i.test(params.trim())
}

function applyColorMixDeclarations(support, config) {
	for (const child of support.nodes ?? []) {
		if (child.type !== 'decl') continue
		const value = normalizeTailwindValue(child.value, config)
		if (
			value.includes('color-mix(') ||
			value.includes('oklch(') ||
			value.includes('oklab(') ||
			(value.includes('var(--') && !/^rgba\(var\(--[\w-]+-rgb\),\s*\d*\.?\d+\)$/.test(value))
		)
			continue

		// 保留支持分支的位置和优先级，不能回写前后不属于该分支的声明。
		const declaration = child.clone({ value })
		support.before(declaration)
		sanitizeDeclaration(declaration, config)
	}
}

function sanitizeDeclaration(declaration, config, preserveValues = false) {
	if (declaration.type !== 'decl') return
	if (invalidCssValuePattern.test(declaration.value)) {
		declaration.remove()
		return
	}
	// Web 支持浏览器原生属性与变量，不应用 App 兼容改写。
	if (!config.nativeCss) return
	if (declaration.prop === '-webkit-backdrop-filter') {
		declaration.remove()
		return
	}
	const physicalProperties = logicalProperties.get(declaration.prop)
	if (physicalProperties) {
		const value = preserveValues
			? normalizeTailwindCalculations(declaration.value, config)
			: normalizeTailwindValue(declaration.value, config)
		// 双值轴向间距分别对应两侧，函数参数中的空格不参与拆分。
		const values = postcss.list.space(value)
		for (const [index, prop] of physicalProperties.entries()) {
			declaration.cloneBefore({ prop, value: values[index] ?? values[0] })
		}
		declaration.remove()
		return
	}
	if (
		(unsupportedDeclarations.has(declaration.prop) &&
			(config.removeAnimations || !declaration.prop.startsWith('animation'))) ||
		(declaration.prop === 'display' && unsupportedDisplayValues.has(declaration.value))
	) {
		declaration.remove()
		return
	}
	if (
		preserveValues ||
		config.preserveAllValues ||
		consumePreservedDeclaration(declaration, config.preserveDeclarations)
	) {
		declaration.value = normalizeTailwindCalculations(declaration.value, config)
		return
	}
	declaration.value = normalizeTailwindValue(declaration.value, config)
	if (declaration.prop === 'opacity' && declaration.value.endsWith('%')) {
		declaration.value = `${Number.parseFloat(declaration.value) / 100}`
	}
}

function isVaporClassSelector(selector, allowEscapedSelectors) {
	// 完整消费转义及 hex 的一个终止空白，再检查真正的 class 字符。
	const className = selector
		.slice(1)
		.replace(/\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[\t\n\f\r ])?|[^\n\f\r0-9a-fA-F])/g, 'a')
	return (
		selector.startsWith('.') &&
		(allowEscapedSelectors || !selector.includes('\\')) &&
		/^[a-zA-Z0-9_\u0080-\uffff-]+$/.test(className)
	)
}

function isDarkVariantSelector(selector) {
	const whereIndex = selector.indexOf(':where(')
	return (
		whereIndex > 1 &&
		isVaporClassSelector(selector.slice(0, whereIndex), true) &&
		/^:where\(\s*\.dark\s*,\s*\.dark\s+\*\s*\)$/.test(selector.slice(whereIndex))
	)
}

function removeVueScope(selector) {
	return selector.replace(/\[data-v-[a-zA-Z0-9]+\]/g, '')
}

function normalizeEscapedSelector(selector, register) {
	if (!selector.startsWith('.')) return selector
	const whereIndex = selector.indexOf(':where(')
	if (whereIndex > 1 && !isDarkVariantSelector(selector)) return selector
	const classSelector = whereIndex > 1 ? selector.slice(0, whereIndex) : selector
	if (!isVaporClassSelector(classSelector, true)) return selector
	register?.(decodeCssClassName(classSelector.slice(1)))
	if (!selector.includes('\\')) return selector

	return `.${toSafeClassName(decodeCssClassName(classSelector.slice(1)))}${whereIndex > 1 ? selector.slice(whereIndex) : ''}`
}

function normalizeTailwindValue(value, config) {
	if (config?.nativeCss === false) return value
	return normalizeTailwindCalculations(value, config)
}

function normalizeTailwindCalculations(value, config) {
	return value
		.replace(
			/rgb\(\s*(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?%?)\s*\/\s*([\d.]+%?)\s*\)/g,
			(_, red, green, blue, alpha) => `rgba(${red},${green},${blue},${alpha})`
		)
		.replace(/var\(--tw-shadow-color,\s*(rgba?\([^)]*\)|#[\da-f]{3,8}|[a-z-]+)\)/gi, '$1')
		.replace(
			/color-mix\(in (?:oklab|srgb),\s*var\((--[\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g,
			(full, name, opacity) => {
				const variable = name
				const channelName = `${variable}-rgb`
				return config.channelVariables?.has(variable) ||
					matchesColorVariable(variable, config.colorVariablePatterns)
					? `rgba(var(${channelName}),${formatNumber(Number(opacity) / 100)})`
					: full
			}
		)
		.replace(
			/color-mix\(in (oklab|srgb),\s*(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgb\([^)]*\)|oklch\([^)]*\))\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g,
			(_, colorSpace, color, opacity) =>
				colorToRgba(color, Number(opacity) / 100) ??
				`color-mix(in ${colorSpace}, ${color} ${opacity}%, transparent)`
		)
		.replace(
			/oklch\(\s*(\d+(?:\.\d+)?)%\s+(\d*\.?\d+|none)\s+(-?\d*\.?\d+|none)(?:deg)?(?:\s*\/\s*([^)]+))?\s*\)/g,
			(_, lightness, chroma, hue, alpha) =>
				oklchToCss(
					Number(lightness) / 100,
					chroma === 'none' ? 0 : Number(chroma),
					hue === 'none' ? 0 : Number(hue),
					alpha
				)
		)
		.replace(/oklab\(100% 0 [^/]+ \/ ([^)]+)\)/g, 'rgba(255,255,255,$1)')
}

/** 别名沿用自身作用域的通道引用，不把某个皮肤的颜色或别名替换进使用处。 */
function injectAliasColorChannels(root, channels, existingChannels) {
	const declarations = new Map()
	root.walkDecls(/^--/, (node) => {
		if (node.prop.endsWith('-rgb') || channels.has(node.prop)) return
		const list = declarations.get(node.prop) ?? []
		list.push(node)
		declarations.set(node.prop, list)
	})
	let changed = true
	while (changed) {
		changed = false
		for (const [name, nodes] of declarations) {
			const targets = nodes.map((node) => node.value.trim().match(/^var\((--[\w-]+)\)$/)?.[1])
			if (!targets.every((target) => channels.has(target))) continue
			for (const [index, node] of nodes.entries()) {
				if (!existingChannels.get(node.parent)?.has(`${name}-rgb`))
					node.cloneAfter({ prop: `${name}-rgb`, value: `var(${targets[index]}-rgb)` })
			}
			channels.add(name)
			declarations.delete(name)
			changed = true
		}
	}
}

/** 为主题颜色生成 RGB 通道变量，供任意透明度的 rgba(var(...)) 使用。 */
function injectThemeColorChannels(root, patterns, channels, existingChannels) {
	root.walkDecls((declaration) => {
		if (declaration.prop.endsWith('-rgb')) return
		if (!declaration.prop.startsWith('--') || !matchesColorVariable(declaration.prop, patterns))
			return
		const value = declaration.value.trim()
		const color = normalizeColor(value)
		if (color == null || /^(?:rgba\(|#[\da-f]{4}$|#[\da-f]{8}$)/i.test(value)) {
			throw declaration.error(
				`colorVariables 中的 ${declaration.prop} 必须在每个作用域使用可转换的不透明 hex、rgb 或 oklch 色值；不能使用别名或半透明颜色。`
			)
		}
		channels.add(declaration.prop)
		const channelName = `${declaration.prop}-rgb`
		if (existingChannels.get(declaration.parent)?.has(channelName)) return
		declaration.cloneAfter({
			prop: channelName,
			value: `${color.red},${color.green},${color.blue}`
		})
	})
}

function matchesColorVariable(name, patterns = []) {
	if (name == null) return false
	return patterns.some((pattern) => {
		if (typeof pattern === 'string') return pattern === name
		pattern.lastIndex = 0
		const matched = pattern.test(name)
		pattern.lastIndex = 0
		return matched
	})
}

function consumePreservedDeclaration(declaration, declarations) {
	const key = `${declaration.prop}\u0000${declaration.value}\u0000${declaration.important}`
	const count = declarations.get(key) ?? 0
	if (count === 0) return false
	if (count === 1) declarations.delete(key)
	else declarations.set(key, count - 1)
	return true
}

function formatNumber(value) {
	return `${Number(value.toFixed(6))}`
}

function colorToRgba(color, opacity) {
	const normalized = normalizeColor(color)
	if (normalized == null) return null
	return `rgba(${normalized.red},${normalized.green},${normalized.blue},${opacity})`
}

function normalizeColor(color) {
	const hex = color.match(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
	if (hex != null) {
		const value = hex[0].slice(1)
		const expanded = value.length === 3 ? value.replace(/(.)/g, '$1$1') : value
		return {
			red: Number.parseInt(expanded.slice(0, 2), 16),
			green: Number.parseInt(expanded.slice(2, 4), 16),
			blue: Number.parseInt(expanded.slice(4, 6), 16)
		}
	}
	const rgb = color.match(/^rgb\(\s*(\d+)\s*(?:,|\s)\s*(\d+)\s*(?:,|\s)\s*(\d+)\s*\)$/)
	if (rgb != null) return { red: Number(rgb[1]), green: Number(rgb[2]), blue: Number(rgb[3]) }
	const oklch = color.match(
		/^oklch\((\d+(?:\.\d+)?)%\s+(\d*\.?\d+|none)\s+(-?\d*\.?\d+|none)(?:deg)?\)$/
	)
	if (oklch != null) {
		const value = oklchToCss(
			Number(oklch[1]) / 100,
			oklch[2] === 'none' ? 0 : Number(oklch[2]),
			oklch[3] === 'none' ? 0 : Number(oklch[3]),
			null
		)
		const match = value.match(/^rgb\((\d+),(\d+),(\d+)\)$/)
		if (match != null)
			return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]) }
	}
	return null
}

function oklchToCss(lightness, chroma, hue, alpha) {
	const angle = (hue * Math.PI) / 180
	const a = chroma * Math.cos(angle)
	const b = chroma * Math.sin(angle)
	const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
	const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
	const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
	const red = toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
	const green = toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
	const blue = toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	if (alpha == null) return `rgb(${red},${green},${blue})`
	return `rgba(${red},${green},${blue},${alpha})`
}

function toSrgb(value) {
	const linear = Math.max(0, Math.min(1, value))
	const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
	return Math.round(encoded * 255)
}
