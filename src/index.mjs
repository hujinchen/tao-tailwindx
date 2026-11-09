import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import tailwindPostcss from '@tailwindcss/postcss'
import postcss from 'postcss'
import scssParser from 'postcss-scss'
import picomatch from 'picomatch'
import { sanitize } from './sanitize.mjs'
import { foldCalculations } from './calc.mjs'
import { installUtsRenameRetry } from './uts-rename-retry.mjs'
import { profilePlugins } from './profile.mjs'
import { createClassNameRegistry, decodeCssClassName, toSafeClassName } from './class-name.mjs'
import { normalizeClassValues } from './class-values.mjs'
import { createConditionContext, filterConditions } from './conditions.mjs'
import { themeValuesPlugin } from './theme-values.mjs'
import {
	appendLocalStyleRules,
	collectLocalStyles,
	collectSourceCache,
	getLocalStyleTargetIndex,
	transformLocalStyles
} from './local-styles.mjs'

/**
 * Compile Tailwind v4 and reduce its output to CSS accepted by uni-app x Vapor.
 * Vite accepts the returned plugin array directly in its plugins list.
 *
 * @param {object} [options={}] 插件配置。
 * @param {Object<string, Array<string|RegExp>>} [options.customAttributes={}] 按标签名配置额外的 class 属性；`*` 表示所有标签。
 * @param {boolean} [options.componentLocalStyles=true] 按 SFC 及脚本依赖生成局部 utility；全局仅保留 App 与公共 CSS 显式 inline 候选。
 * @param {boolean} [options.strict=true] 是否仅保留 uni-app x Vapor 支持的纯 class selector。
 * @param {boolean} [options.allowEscapedSelectors] 是否保留带 CSS 转义符的 class selector；默认仅 Web 平台开启。
 * @param {boolean} [options.allowDarkVariantSelectors] 是否保留 Tailwind 官方 dark 变体选择器；默认 Web 和小程序开启。
 * @param {boolean} [options.debug=false] 是否输出插件调试日志。
 * @param {string} [options.entry] Tailwind CSS 入口的绝对路径；未配置时回退到 `reference`。
 * @param {boolean} [options.utsRenameRetry=false] 是否为 uni-app x SDK 的 uts2js 滚动缓存重试并兜底 rename；默认关闭。
 * @param {Array<string|RegExp>} [options.colorVariables=[]] 交给 CSS 清洗器识别为颜色的自定义变量名。
 * @param {{input: string|string[], output: string}} [options.themeValues] 可选主题数据导出，输入 CSS 路径与输出 TS 路径。
 * @param {Array<string|RegExp>} [options.include] Vapor CSS 清洗器需要处理的文件匹配规则。
 * @param {Array<string|RegExp>} [options.exclude] Vapor CSS 清洗器需要排除的文件匹配规则。
 * @param {string} [options.reference] 为 Vue 样式中的 `@apply` 注入的 Tailwind `@reference` 路径。
 * @param {object} [options.tailwind] 透传给 `@tailwindcss/postcss` 的插件选项。
 * @returns {import('vite').Plugin[]} 可直接加入 Vite `plugins` 的插件数组。
 */
export function uniAppXTailwind(options = {}) {
	const platform = detectPlatform()
	const isWebPlatform = platform === 'web' || platform === 'h5'
	const supportsDarkVariant = isWebPlatform || platform.startsWith('mp-')
	const rootSelector = isWebPlatform ? ':root' : 'page'
	let resolverContext = null
	const resolveImport = async (source, importer) => {
		const result = await resolverContext.resolve(source, importer, { skipSelf: true })
		if (result == null && (source.startsWith('.') || source.startsWith('@/')))
			throw new Error(`[uniappx-tailwind] 无法解析脚本依赖 ${source}，来源：${importer}`)
		return result
	}
	const config = {
		conditionContext: createConditionContext(platform),
		customAttributes: options.customAttributes ?? {},
		componentLocalStyles: options.componentLocalStyles ?? true,
		utsRenameRetry: options.utsRenameRetry ?? false,
		colorVariables: options.colorVariables ?? [],
		debug: options.debug ?? false,
		strict: options.strict ?? true,
		allowEscapedSelectors: options.allowEscapedSelectors ?? isWebPlatform,
		allowDarkVariantSelectors: options.allowDarkVariantSelectors ?? supportsDarkVariant,
		preserveColorSchemeMedia: true,
		preserveMedia: isWebPlatform || platform.startsWith('mp-'),
		nativeCss: !isWebPlatform,
		nativeAnimations: ['app', 'app-android', 'app-ios', 'app-harmony'].includes(platform),
		warnedDarkVariantFiles: new Set(),
		registerClassName: createClassNameRegistry(),
		entry: options.entry ?? options.reference ?? null,
		appFile: resolve(
			process.env.UNI_INPUT_DIR ??
				dirname(options.entry ?? options.reference ?? resolve('tailwind.css')),
			'App.uvue'
		),
		resolveImport: null,
		sourceOwners: new Map(),
		// 全端保留合法属性的展开形式，不合并四边定位或改写渐变方向。
		tailwind: { ...options.tailwind, optimize: false },
		// 编译器与成功结果跨 transform 复用；源码变化后先确认样式输入是否变化。
		tailwindCompiler: null,
		compiledEntryPromise: null,
		compiledEntryResult: null,
		localStyles: null,
		localStylesRevision: -1,
		expandedEntry: null,
		sourceSignatures: null,
		sourceRefreshPromise: null,
		sourceCache: null,
		dependencies: new Set(),
		directoryDependencies: [],
		outputDirectory: null,
		buildCommand: false,
		buildSourceRevision: null,
		sourceChangePending: false,
		hotUpdateRevisions: new Map(),
		sourceRevision: 0,
		appStyleSources: new Map(),
		appStyleOutputs: new Map(),
		entryKeyframes: new Map(),
		applyKeyframes: new Map(),
		applyOutputs: new Map(),
		include: options.include ?? [/\.(?:css|pcss|postcss)$/],
		exclude: options.exclude ?? [/node_modules/, /unpackage/]
	}
	if (config.utsRenameRetry) {
		const installed = installUtsRenameRetry({
			onGiveUp: (message) => debugLog(config, message)
		})
		if (installed) debugLog(config, 'uts2js rename retry installed')
	}
	const plugins = [
		{
			name: 'uniappx-tailwind-important-class',
			enforce: 'pre',
			transform(code, id) {
				if (!/\.(?:uvue|ts|uts)(?:\?|$)/.test(id)) return null
				if (id.includes('type=style')) {
					if (
						!config.componentLocalStyles ||
						config.entry == null ||
						!/\.uvue\?/.test(id)
					)
						return null
					if (/<(?:template|script)\b/i.test(code)) return null
					return (async () => {
						if (
							config.localStyles == null ||
							config.localStylesRevision !== config.sourceRevision
						)
							await compileEntry(config, rootSelector)
						const file = resolve(id.split(/[?#]/, 1)[0])
						const key = normalizePath(file)
						const aliases = config.localStyles?.aliasesByFile.get(key)
						const source =
							config.sourceCache?.records.get(key)?.content ??
							(await readFile(file, 'utf8'))
						const targetIndex = getLocalStyleTargetIndex(
							source,
							isWebPlatform,
							config.conditionContext
						)
						const styleIndex = Number(
							new URLSearchParams(id.split('?')[1]).get('index') ?? '0'
						)
						if (styleIndex !== targetIndex) return null
						const cssModule = extractCssModule(code)
						const css = cssModule?.css ?? code
						const transformed = appendLocalStyleRules(
							css,
							aliases ?? new Map(),
							config.localStyles?.compiledRules,
							isWebPlatform && cssModule == null && /lang[.=]s[ac]ss(?:&|$)/.test(id)
						)
						if (transformed === css) return null
						return {
							code: cssModule
								? code.replace(cssModule.value, JSON.stringify(transformed))
								: transformed,
							map: null
						}
					})()
				}
				// 脚本数据和 Vue 已拆分的模块保持原值；转换只在完整模板的绑定处生成一次。
				if (
					!/\.uvue(?:\?|$)/.test(id) ||
					/\?[^#]*\btype=(?:script|template)(?:&|$)/.test(id)
				)
					return null
				const normalize = (source) => {
					const transformed = normalizeClassValues(
						source,
						config.customAttributes,
						config.entry == null ? createClassNameRegistry() : null,
						(value) =>
							filterConditions(value, config.conditionContext, id.split(/[?#]/, 1)[0])
					)
					return transformed === code ? null : { code: transformed, map: null }
				}
				// Vue 拆分后的 script/template 虚拟模块不能承载 SFC style 块。
				if (
					config.componentLocalStyles &&
					config.entry != null &&
					/\.uvue(?:\?|$)/.test(id) &&
					!/\?[^#]*\btype=(?:script|template)(?:&|$)/.test(id)
				) {
					return (async () => {
						if (
							config.localStyles == null ||
							config.localStylesRevision !== config.sourceRevision
						)
							await compileEntry(config, rootSelector)
						const source = transformLocalStyles(
							code,
							resolve(id.split(/[?#]/, 1)[0]),
							config.localStyles?.aliasesByFile ?? new Map(),
							isWebPlatform,
							config.localStyles?.compiledRules,
							config.conditionContext
						)
						return normalize(source)
					})()
				}
				return normalize(code)
			}
		},
		{
			name: 'uniappx-tailwind-app-style',
			enforce: 'pre',
			buildStart() {
				config.buildSourceRevision = config.buildCommand ? -1 : null
				// 使用宿主解析链，保持 alias、扩展名与其他 Vite 插件的解析语义一致。
				resolverContext = this
				config.resolveImport = resolveImport
			},
			buildEnd() {
				config.buildSourceRevision = null
			},
			configResolved(resolvedConfig) {
				config.buildCommand = resolvedConfig.command === 'build'
				config.outputDirectory = resolve(resolvedConfig.root, resolvedConfig.build.outDir)
				config.appFile = resolve(
					process.env.UNI_INPUT_DIR ?? resolvedConfig.root,
					'App.uvue'
				)
			},
			watchChange(id) {
				invalidateForSourceChange(config, id)
			},
			configureServer(server) {
				const onScanChange = async (file) => {
					if (!invalidateForSourceChange(config, file)) return
					const affected = collectAffectedStyleModules(config, server, file)
					if (config.componentLocalStyles) await compileEntry(config, rootSelector)
					for (const module of new Set([
						...affected,
						...collectAffectedStyleModules(config, server, file),
						...collectAppStyleModules(server)
					])) {
						server.moduleGraph.invalidateModule(module)
						await server.reloadModule(module)
					}
				}
				const onChange = (file) => {
					onScanChange(file).catch((error) =>
						server.config.logger.error(error.stack ?? String(error))
					)
				}
				server.watcher.on('add', onChange)
				server.watcher.on('unlink', onChange)
				server.httpServer?.once('close', () => {
					server.watcher.off('add', onChange)
					server.watcher.off('unlink', onChange)
				})
			},
			async handleHotUpdate(context) {
				if (isTrackedSourceFile(config, context.file)) {
					const current = await waitForLatestHotUpdate(config, context.file)
					if (!current) {
						debugLog(config, `HMR ignored: superseded update for ${context.file}`)
						return []
					}
				}
				debugLog(
					config,
					`HMR received: platform=${platform}; file=${context.file}; modules=${
						context.modules.length
					}; entry=${config.entry ?? 'none'}`
				)
				if (!invalidateForSourceChange(config, context.file)) {
					debugLog(
						config,
						'HMR ignored: file is not a Tailwind source or entry is missing'
					)
					return
				}

				const appStyleModules = collectAppStyleModules(context.server)
				const localStyleModules = config.componentLocalStyles
					? collectAffectedStyleModules(config, context.server, context.file)
					: []
				for (const module of new Set([...localStyleModules, ...appStyleModules])) {
					context.server.moduleGraph.invalidateModule(module)
				}
				// 先完成候选扫描，再让 Vite 生成页面 style 更新，避免热更新拿到上一轮候选。
				if (config.componentLocalStyles) await compileEntry(config, rootSelector)
				debugLog(
					config,
					`HMR action: invalidated local styles=${localStyleModules.length}; App styles=${appStyleModules.length}`
				)
				// addWatchFile 会为扫描文件创建未加载模块；它们不应成为整页刷新的边界。
				const modules = context.modules.filter(
					(module) =>
						!(
							module.transformResult == null &&
							module.importers?.size > 0 &&
							[...module.importers].every((importer) =>
								appStyleModules.includes(importer)
							)
						)
				)
				return [...new Set([...modules, ...localStyleModules, ...appStyleModules])]
			},
			async transform(code, id) {
				if (!id.includes('App.uvue?vue&type=style')) return null
				const isEntryImport = (node) => {
					const match = node.params.match(/^(['"])([^'"]+)\1\s*$/)
					return (
						match != null &&
						config.entry != null &&
						isSamePath(resolve(dirname(id.split('?')[0]), match[2]), config.entry)
					)
				}
				const root = postcss.parse(code, { from: id })
				let hasEntry = false
				root.walkAtRules('import', (node) => {
					if (isEntryImport(node)) hasEntry = true
				})
				if (hasEntry) config.appStyleSources.set(id, code)
				else if (code !== config.appStyleOutputs.get(id)?.result.code) {
					config.appStyleSources.delete(id)
					config.appStyleOutputs.delete(id)
					config.entryKeyframes.delete(styleModuleKey(id))
					return null
				}
				const source = config.appStyleSources.get(id)
				if (source == null) {
					debugLog(config, `App style skipped: id=${id}`)
					return null
				}

				const checkedSources = await refreshEntryCacheIfSourcesChanged(config)
				const compiled = await compileEntry(config, rootSelector, checkedSources)
				if (config.buildSourceRevision != null)
					config.buildSourceRevision = config.localStylesRevision
				config.entryKeyframes.set(styleModuleKey(id), compiled.keyframes)
				addWatchFiles(this, [
					config.entry,
					...compiled.dependencies,
					...config.directoryDependencies.map((dependency) => dependency.dir)
				])
				const cached = config.appStyleOutputs.get(id)
				if (cached?.source === source && cached.css === compiled.css) {
					debugLog(config, `App style reused: id=${id}; cssChanged=false`)
					return cached.result
				}
				debugLog(
					config,
					`App style compiled: id=${id}; css=${compiled.css.length}; cssChanged=${cached?.css !== compiled.css}`
				)
				// 只展开 Tailwind 入口，其他导入和字体声明仍交给 uni 样式管线。
				const output = postcss.parse(source, { from: id })
				output.walkAtRules('import', (node) => {
					if (isEntryImport(node)) node.replaceWith(postcss.parse(compiled.css).nodes)
				})
				const result = {
					code: output.toString(),
					map: null
				}
				config.appStyleOutputs.set(id, { source, css: compiled.css, result })
				return result
			}
		},
		{
			name: 'uniappx-tailwind-reference',
			enforce: 'pre',
			transform(code, id) {
				if (
					config.entry == null ||
					!id.includes('?vue&type=style') ||
					!code.includes('@apply')
				)
					return null

				const reference = `@reference ${JSON.stringify(config.entry)};\n`
				const cssModule = extractCssModule(code)
				const normalized = cssModule
					? code.replace(cssModule.value, JSON.stringify(`${reference}${cssModule.css}`))
					: `${reference}${code}`
				return { code: normalized, map: null }
			}
		},
		{
			name: 'uniappx-tailwind-apply-fallback',
			enforce: 'pre',
			async transform(code, id) {
				if (!id.includes('?vue&type=style')) return null
				const moduleKey = styleModuleKey(id)
				config.applyKeyframes.delete(moduleKey)
				if (!code.includes('@apply')) {
					config.applyOutputs.delete(id)
					return null
				}
				const cached = config.applyOutputs.get(id)
				if (cached) {
					const signatures = await getFileSignatures([...cached.dependencies.keys()])
					const unchanged = [...signatures].every(
						([file, value]) => cached.dependencies.get(file) === value
					)
					if (
						config.applyOutputs.get(id) === cached &&
						cached.source === code &&
						unchanged
					) {
						config.applyKeyframes.set(moduleKey, cached.keyframes)
						addWatchFiles(this, signatures.keys())
						return cached.result
					}
					// 样式未变也要检查 @reference 的主题、配置和嵌套 CSS 依赖。
					if (!unchanged) config.expandedEntry = null
				}
				const startedAt = Date.now()
				const revision = config.sourceRevision
				const dependencies = new Set(config.entry ? [config.entry] : [])
				const collectDependencies = (result) => {
					for (const message of result.messages) {
						if (message.type === 'dependency' && typeof message.file === 'string')
							dependencies.add(resolve(message.file))
					}
				}
				let lastInput = null
				const compile = async (input) => {
					lastInput = input
					// watcher 的失效版本也传给 Tailwind，避免其内部缓存复用同签名的旧主题。
					return postcss([getTailwindCompiler(config)]).process(
						`/* uniappx-tailwind apply revision ${revision} */\n${input}`,
						{
							from: id.replace(/\?.*$/, ''),
							parser: scssParser
						}
					)
				}

				const cssModule = extractCssModule(code)
				const css = cssModule ? cssModule.css : code
				// 只替换真实指令，保留注释、字符串和其余 SCSS 原文。
				const applies = []
				scssParser
					.parse(css, { from: id })
					.walkAtRules('apply', (node) => applies.push(node))
				const declarationsByApply = new Map()
				// @apply animate-* 同时产生关键帧，不能只提取声明而丢弃动画定义。
				const keyframes = new Map()
				const keyframeNames = new Set()
				const collectKeyframes = (root) => {
					root.walkAtRules(/^(?:-webkit-)?keyframes$/, (node) => {
						keyframes.set(`${node.name}:${node.params}`, node.toString())
						keyframeNames.add(node.params)
					})
				}
				const staticApplies = [...new Set(applies.map((node) => node.params))].filter(
					(apply) => !apply.includes('#{') && !apply.includes('$')
				)
				const reference = config.entry
					? `@reference ${JSON.stringify(config.entry)};\n`
					: ''
				// 任意值探针同批编译并去重；每条表达式仍独立消费声明保护计数。
				const arbitraryByApply = new Map(
					staticApplies.map((apply) => [
						apply,
						(apply.match(/\S+/g) ?? []).filter((candidate) => candidate.includes('['))
					])
				)
				const arbitraryCandidates = [...new Set([...arbitraryByApply.values()].flat())]
				if (staticApplies.length > 0) {
					const result = await compile(
						reference +
							[
								...staticApplies.map(
									(apply, index) =>
										`.__tailwind_apply_${index} { @apply ${apply}; }`
								),
								...arbitraryCandidates.map(
									(candidate, index) =>
										`.__tailwind_arbitrary_${index} { @apply ${candidate}; }`
								)
							].join('\n')
					)
					const rules = new Map(
						result.root.nodes
							.filter((node) => node.type === 'rule')
							.map((node) => [node.selector, node])
					)
					const arbitraryDeclarations = new Map(
						arbitraryCandidates.map((candidate, index) => [
							candidate,
							collectArbitraryApplyDeclarations(
								rules.get(`.__tailwind_arbitrary_${index}`),
								config,
								rootSelector,
								id
							)
						])
					)
					await normalizeTailwindAnimations(result.root, config)
					tailwindCalculations(result.root, config)
					for (const [index, apply] of staticApplies.entries()) {
						const preserveDeclarations = new Map()
						for (const candidate of arbitraryByApply.get(apply))
							for (const [key, count] of arbitraryDeclarations.get(candidate))
								preserveDeclarations.set(
									key,
									(preserveDeclarations.get(key) ?? 0) + count
								)
						const rule = rules.get(`.__tailwind_apply_${index}`)
						const sanitized = sanitize(
							postcss.root({ nodes: rule ? [rule.clone()] : [] }),
							{ ...config, rootSelector, preserveDeclarations },
							id
						)
						declarationsByApply.set(
							apply,
							sanitized.first?.nodes?.map((node) => `${node.toString()};`).join('') ??
								''
						)
					}
					for (const rule of rules.values()) rule.remove()
					collectKeyframes(sanitize(result.root, { ...config, rootSelector }, id))
				}
				let output = css
				for (const node of applies.reverse()) {
					const apply = node.params
					if (apply.includes('#{') || apply.includes('$')) continue

					let declarations = declarationsByApply.get(apply)
					// Sass 保护仅作用于 @apply 生成片段，手写声明不参与。
					if (isWebPlatform && /lang[.=]s[ac]ss(?:&|$)/.test(id)) {
						declarations = declarations.replace(
							/calc\(infinity\s*\*\s*1(?:px|rpx)\)/g,
							(value) => `#{${JSON.stringify(value)}}`
						)
					}
					output =
						output.slice(0, node.source.start.offset) +
						declarations +
						output.slice(node.source.end.offset)
				}
				output = output.replace(/^@reference\s+[^;]+;\s*/m, '')
				if (keyframes.size > 0) output += '\n' + [...keyframes.values()].join('\n')
				config.applyKeyframes.set(moduleKey, keyframeNames)
				const result = {
					code: cssModule
						? code.replace(cssModule.value, JSON.stringify(output))
						: output,
					map: null
				}
				// Tailwind v4 重建前报告旧依赖；每次缓存 miss 补取重建后的完整依赖。
				if (lastInput != null) collectDependencies(await compile(lastInput))
				const signatures = await getFileSignatures([...dependencies])
				// 编译期间再次变更的依赖不能与旧输出一起写入热缓存。
				if (
					config.sourceRevision === revision &&
					[...signatures.values()].every(
						(value) => Number(value.split(':')[0]) < startedAt
					)
				) {
					config.applyOutputs.set(id, {
						source: code,
						dependencies: signatures,
						keyframes: keyframeNames,
						result
					})
				} else config.applyOutputs.delete(id)
				addWatchFiles(this, dependencies)
				return result
			}
		},
		{
			name: 'uniappx-tailwind-vapor-compat',
			enforce: 'post',
			handleHotUpdate(context) {
				if (!config.componentLocalStyles || !isWebPlatform) return
				const localStyleModules = collectAffectedStyleModules(
					config,
					context.server,
					context.file
				)
				if (localStyleModules.length === 0) return
				// uni-app x Vue HMR 会按原始 SFC 样式比较结果覆盖前序插件模块；此处恢复编译期注入 utility 的 style 更新。
				return [...new Set([...context.modules, ...localStyleModules])]
			},
			transform(code, id) {
				if (!matches(id, config.include, config.exclude)) return null
				if (code.includes('__js_style_placeholder__')) return null

				const scopeId = new URLSearchParams(id.split('?')[1]).get('scoped')
				const moduleKey = styleModuleKey(id)
				const tailwindKeyframes = new Set([
					...(config.entryKeyframes.get(moduleKey) ?? []),
					...(config.applyKeyframes.get(moduleKey) ?? [])
				])
				const cssModule = extractCssModule(code)
				if (cssModule == null && /^\s*import\s/m.test(code)) return null
				if (cssModule) {
					const css = cssModule.css
					warnIfNativeDarkVariantRemoved(css, config, id)
					const sanitizedCss = sanitize(
						css,
						{
							...config,
							rootSelector,
							scopeId,
							preserveVueScope: isWebPlatform && scopeId != null,
							tailwindKeyframes,
							removeKeyframes: false,
							removeAnimations: false
						},
						id
					).toString()
					return {
						code: code.replace(cssModule.value, JSON.stringify(sanitizedCss)),
						map: null
					}
				}
				if (code.includes('__vite__css')) return null

				warnIfNativeDarkVariantRemoved(code, config, id)
				const root = sanitize(
					code,
					{
						...config,
						rootSelector,
						scopeId,
						preserveVueScope: isWebPlatform && scopeId != null,
						tailwindKeyframes
					},
					id
				)
				return {
					code: root.toString(),
					map: null
				}
			}
		}
	]
	if (options.themeValues != null) plugins.push(themeValuesPlugin(options.themeValues))
	return profilePlugins(plugins, config.debug)
}

/** 提取同批任意值探针的声明，不与其他表达式共享可消费的计数。 */
function collectArbitraryApplyDeclarations(rule, config, rootSelector, id) {
	const declarations = new Map()
	const root = sanitize(
		tailwindCalculations(postcss.root({ nodes: rule ? [rule.clone()] : [] }), config),
		{ ...config, rootSelector, preserveAllValues: true },
		id
	)
	for (const node of root.nodes ?? []) {
		if (node.type !== 'rule') continue
		for (const declaration of node.nodes ?? []) {
			if (declaration.type !== 'decl') continue
			const key = `${declaration.prop}\u0000${declaration.value}\u0000${declaration.important}`
			declarations.set(key, (declarations.get(key) ?? 0) + 1)
		}
	}
	return declarations
}

function getTailwindCompiler(config) {
	if (config.tailwindCompiler == null) config.tailwindCompiler = tailwindPostcss(config.tailwind)
	return config.tailwindCompiler
}

function styleModuleKey(id) {
	const [file, query] = id.split('?')
	return `${normalizePath(file)}?index=${new URLSearchParams(query).get('index') ?? '0'}`
}

function collectTailwindKeyframes(root, visit = () => {}) {
	const names = new Set()
	const sources = new Map()
	root.walkAtRules(/^(?:-webkit-)?keyframes$/, (node) => {
		const source = node.source
		if (source?.start?.offset == null || source.end?.offset == null) return
		const css = source.input.css
		if (!sources.has(css)) {
			const ranges = []
			// 入口也可能携带手写 CSS；仅接受 Tailwind 指令内可追溯的关键帧。
			scssParser.parse(css).walkAtRules(/^(?:theme|utility|apply|tailwind)$/, (directive) => {
				ranges.push([directive.source.start.offset, directive.source.end.offset])
			})
			sources.set(css, ranges)
		}
		if (
			sources
				.get(css)
				.some(
					([start, end]) => source.start.offset >= start && source.end.offset <= end + 1
				)
		) {
			names.add(node.params)
			visit(node)
		}
	})
	return names
}

async function normalizeTailwindAnimations(root, config) {
	if (!config.nativeAnimations) return root
	collectTailwindKeyframes(root, (node) => {
		node.walkDecls('transform', (declaration) => {
			// 5.31 将关键帧 none 编为 null；显式单位变换才能参与原生插值。
			if (declaration.value === 'none') declaration.value = 'translateY(0)'
		})
	})
	const sources = new Map()
	const hasSource = (node, directives) => {
		const source = node.source
		if (source?.start?.offset == null || source.end?.offset == null) return false
		const css = source.input.css
		if (!sources.has(css)) {
			const ranges = []
			scssParser.parse(css).walkAtRules((directive) => {
				ranges.push([
					directive.name,
					directive.source.start.offset,
					directive.source.end.offset
				])
			})
			sources.set(css, ranges)
		}
		return sources
			.get(css)
			.some(
				([name, start, end]) =>
					directives.includes(name) &&
					source.start.offset >= start &&
					source.end.offset <= end + 1
			)
	}
	const declarations = []
	root.walkDecls('animation', (node) => {
		const match = node.value.match(/^var\((--animate-[\w-]+)(?:,\s*([\s\S]*))?\)$/)
		if (match && hasSource(node, ['tailwind', 'apply', 'utility']))
			declarations.push([node, match[1], match[2]])
	})
	if (declarations.length === 0) return root
	const values = new Map()
	const collect = (theme) => {
		theme.walkDecls(/^--animate-/, (node) => {
			if (hasSource(node, ['theme'])) values.set(node.prop, node.value)
		})
	}
	collect(root)
	// @reference 不输出主题变量；仅动画 @apply 按需取回 Tailwind 的最终主题值。
	if (config.entry && declarations.some(([, name]) => !values.has(name))) {
		const expanded = await getExpandedEntry(config)
		const input = expanded.source.clone()
		input.append(
			postcss.rule({
				selector: '.__tailwind_animation_theme__',
				nodes: [...new Set(declarations.map(([, name]) => name))].map((name) =>
					postcss.decl({ prop: 'animation', value: `var(${name})` })
				)
			})
		)
		const theme = await postcss([getTailwindCompiler(config)]).process(input, {
			from: config.entry
		})
		collect(theme.root)
	}
	for (const [node, name, fallback] of declarations) {
		const value = values.get(name)
		// 当前基座不能拆解变量简写；动态值及非主题 fallback 不递归求值。
		if (
			value &&
			!/\b(?:var|env)\(/i.test(value) &&
			(fallback == null || fallback.trim() === value.trim())
		)
			node.value = value
	}
	return root
}

function tailwindCalculations(root, config) {
	if (!config.nativeCss) return root
	const sources = new Map()
	root.walkDecls((declaration) => {
		if (!/calc\(|3\.40282e38/i.test(declaration.value)) return
		const source = declaration.source
		if (source?.start?.offset == null || source.end?.offset == null) return
		const css = source.input.css
		if (!sources.has(css)) {
			const ranges = []
			// Tailwind 4 保留生成声明的指令位置；缺失或未知来源一律不折叠。
			scssParser.parse(css).walkAtRules(/^(?:tailwind|apply|utility)$/, (node) => {
				ranges.push([node.source.start.offset, node.source.end.offset])
			})
			sources.set(css, ranges)
		}
		if (
			sources
				.get(css)
				.some(
					([start, end]) => source.start.offset >= start && source.end.offset <= end + 1
				)
		) {
			declaration.value = foldCalculations(declaration.value, declaration.prop)
		}
	})
	return root
}

/** 使待处理请求失效；成功结果保留到源码比较完成，避免纯逻辑修改重编译。 */
function invalidateEntryCache(config) {
	config.compiledEntryPromise = null
	config.sourceRefreshPromise = null
	config.sourceRevision += 1
}

async function refreshEntryCacheIfSourcesChanged(config) {
	// 仅在同轮 Rollup 构建内复用已完成的扫描；独立请求仍检查漏报。
	if (config.buildSourceRevision === config.sourceRevision) return null
	if (config.sourceRefreshPromise != null) return config.sourceRefreshPromise
	// 仅合并在途检查；后续独立请求仍检查目录，发现 watcher 漏收的新增或删除。
	const promise = (async () => {
		if (config.sourceChangePending) {
			config.sourceChangePending = false
			return null
		}
		if (config.sourceSignatures == null) return null
		const revision = config.sourceRevision
		const signatures = config.sourceSignatures
		const currentSignatures = await getDependencySignatures(config)
		if (config.sourceRevision !== revision) return null
		const changedFiles = []
		for (const file of new Set([...signatures.keys(), ...currentSignatures.keys()])) {
			if (currentSignatures.get(file) !== signatures.get(file)) changedFiles.push(file)
		}
		for (const file of changedFiles) invalidateForSourceChange(config, file)
		config.sourceChangePending = false
		return { revision: config.sourceRevision, signatures: currentSignatures }
	})()
	config.sourceRefreshPromise = promise
	try {
		return await promise
	} finally {
		if (config.sourceRefreshPromise === promise) config.sourceRefreshPromise = null
	}
}

function invalidateForSourceChange(config, file) {
	const sourceFile = file.split(/[?#]/, 1)[0]
	let applyChanged = false
	for (const [id, cached] of config.applyOutputs) {
		if (
			![...cached.dependencies.keys()].some((dependency) =>
				isSamePath(dependency, sourceFile)
			)
		)
			continue
		config.applyOutputs.delete(id)
		applyChanged = true
	}
	if (!isTrackedSourceFile(config, file) && !applyChanged) return false
	invalidateEntryCache(config)
	const key = normalizePath(resolve(sourceFile))
	const record = config.sourceCache?.records.get(key)
	// 非扫描源码或 @apply 依赖必须重建；普通源码先比较候选与 import。
	if (!record || applyChanged) {
		config.compiledEntryResult = null
		config.tailwindCompiler = null
	}
	// watcher 已确认变更，即使大小和时间戳相同也必须重新读取；保留键以复用其他文件的解析路径。
	if (record) config.sourceCache.records.set(key, { ...record, signature: null })
	config.sourceChangePending = true
	const importedCss = config.expandedEntry?.files.some((candidate) =>
		isSamePath(candidate, sourceFile)
	)
	if (importedCss) config.expandedEntry = null
	return true
}

function isTrackedSourceFile(config, file) {
	if (config.entry == null) return false
	const sourceFile = file.split(/[?#]/, 1)[0]
	if (isOutputFile(config, sourceFile)) return false
	return (
		[config.entry, ...config.dependencies].some((candidate) =>
			isSamePath(candidate, sourceFile)
		) ||
		config.directoryDependencies.some((dependency) =>
			dependency.match(relative(dependency.dir, sourceFile).replace(/\\/g, '/'))
		)
	)
}

async function waitForLatestHotUpdate(config, file) {
	const sourceFile = file.split(/[?#]/, 1)[0]
	const key = normalizePath(sourceFile)
	const revision = (config.hotUpdateRevisions.get(key) ?? 0) + 1
	config.hotUpdateRevisions.set(key, revision)
	await new Promise((resolve) => setTimeout(resolve, 80))
	if (config.hotUpdateRevisions.get(key) !== revision) return false
	config.hotUpdateRevisions.delete(key)
	return true
}

async function getDependencySignatures(config) {
	const files = new Set(
		[config.entry, ...config.dependencies].filter((file) => !isOutputFile(config, file))
	)
	for (const dependency of config.directoryDependencies) {
		await collectScanFiles(config, dependency, dependency.dir, files)
	}
	return getFileSignatures([...files])
}

function isOutputFile(config, file) {
	if (config.outputDirectory == null) return false
	const path = normalizePath(file)
	const output = normalizePath(config.outputDirectory).replace(/\/$/, '')
	return path === output || path.startsWith(`${output}/`)
}

async function collectScanFiles(config, dependency, directory, files, depth = 0) {
	if (isOutputFile(config, directory)) return
	let entries
	try {
		entries = await readdir(directory, { withFileTypes: true })
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return
		throw error
	}
	for (const entry of entries) {
		const file = resolve(directory, entry.name)
		if (isOutputFile(config, file)) continue
		if (entry.isDirectory()) {
			if (depth < dependency.maxDepth)
				await collectScanFiles(config, dependency, file, files, depth + 1)
		} else if (dependency.match(relative(dependency.dir, file).replace(/\\/g, '/'))) {
			files.add(file)
		}
	}
}

async function getFileSignatures(files) {
	const signatures = new Map()
	// 限制并发，避免扫描大项目时占满文件系统请求队列。
	for (let index = 0; index < files.length; index += 32) {
		await Promise.all(
			files.slice(index, index + 32).map(async (file) => {
				signatures.set(file, await getFileSignature(file))
			})
		)
	}
	return signatures
}

async function getFileSignature(file) {
	try {
		const fileStat = await stat(file)
		return `${fileStat.mtimeMs}:${fileStat.size}`
	} catch {
		return 'missing'
	}
}

function matches(id, includes, excludes) {
	return (
		includes.some((pattern) => matchesPattern(pattern, id)) &&
		!excludes.some((pattern) => matchesPattern(pattern, id))
	)
}

function matchesPattern(pattern, value) {
	return pattern instanceof RegExp ? pattern.test(value) : value.includes(pattern)
}

function isSamePath(left, right) {
	return normalizePath(left) === normalizePath(right)
}

function normalizePath(value) {
	const normalized = value.replace(/\\/g, '/')
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function collectAppStyleModules(server) {
	const modules = server?.moduleGraph?.idToModuleMap
	if (modules == null) return []
	return [...modules.values()].filter((module) => module.id?.includes('App.uvue?vue&type=style'))
}

function collectSourceStyleModules(server, file) {
	if (file == null) {
		return [...(server?.moduleGraph?.idToModuleMap?.values() ?? [])].filter((module) =>
			module.id?.includes('.uvue?vue&type=style')
		)
	}
	const sourceFile = file.split(/[?#]/, 1)[0]
	if (!/\.uvue$/i.test(sourceFile)) return []
	const graph = server?.moduleGraph
	const modules =
		graph?.getModulesByFile?.(sourceFile) ??
		graph?.getModulesByFile?.(sourceFile.replace(/\\/g, '/'))
	if (modules == null) return []
	const styles = [...modules].filter((module) => module.id?.includes('?vue&type=style'))
	// 首次出现 utility 时可能尚无 style 模块，需要重载 SFC 以创建新增样式块。
	return styles.length > 0
		? styles
		: [...modules].filter((module) => module.id?.split('?')[0] === module.id)
}

/** 共享脚本刷新所有使用者；主题/公共 CSS 变化刷新所有已加载局部样式。 */
function collectAffectedStyleModules(config, server, file) {
	if (!config.componentLocalStyles) return []
	if (/\.(?:css|scss|sass|pcss|postcss)$/i.test(file))
		return collectSourceStyleModules(server, null)
	const owners = config.sourceOwners.get(normalizePath(file)) ?? new Set([file])
	return [...new Set([...owners].flatMap((owner) => collectSourceStyleModules(server, owner)))]
}

function addWatchFiles(context, files) {
	if (typeof context?.addWatchFile !== 'function') return
	for (const file of new Set(files)) {
		if (file != null) context.addWatchFile(file)
	}
}

function detectPlatform() {
	if (process.env.UNI_PLATFORM != null && process.env.UNI_PLATFORM.length > 0)
		return process.env.UNI_PLATFORM

	const platformIndex = process.argv.findIndex(
		(argument) => argument === '-p' || argument === '--platform'
	)
	return platformIndex >= 0 && process.argv[platformIndex + 1] != null
		? process.argv[platformIndex + 1]
		: 'unknown'
}

function debugLog(config, message) {
	if (config.debug) console.info(`[uniappx-tailwind] ${message}`)
}

function warnIfNativeDarkVariantRemoved(css, config, id) {
	if (config.allowDarkVariantSelectors || config.warnedDarkVariantFiles.has(id)) return
	if (!/(?:\\.dark\\:|:where\(\.dark\b)/.test(css)) return
	config.warnedDarkVariantFiles.add(id)
	console.warn(
		'[uniappx-tailwind]',
		`dark: rules were removed for native Vapor compatibility: ${id}; use platform-compatible theme classes or CSS variables instead`
	)
}

async function compileEntry(config, rootSelector, checkedSources = null) {
	if (config.compiledEntryPromise != null) return config.compiledEntryPromise
	const promise = compileEntryFresh(config, rootSelector, checkedSources).catch((error) => {
		// 只清除本次失败，旧请求不能撤销已经开始的新编译。
		if (config.compiledEntryPromise === promise) config.compiledEntryPromise = null
		throw error
	})
	config.compiledEntryPromise = promise
	return promise
}

/** 仅遍历能追溯到 Tailwind utility 指令的规则，手写同名选择器不作为生成证据。 */
function walkTailwindUtilityRules(root, visit) {
	const utilityRanges = new Map()
	root.walkRules((rule) => {
		const source = rule.source
		if (source?.start?.offset == null || source.end?.offset == null) return
		const css = source.input.css
		if (!utilityRanges.has(css)) {
			const ranges = []
			scssParser.parse(css).walkAtRules((node) => {
				if (
					node.name === 'utility' ||
					(node.name === 'tailwind' && node.params === 'utilities')
				)
					ranges.push([node.source.start.offset, node.source.end.offset])
			})
			utilityRanges.set(css, ranges)
		}
		if (
			utilityRanges
				.get(css)
				.some(
					([start, end]) => source.start.offset >= start && source.end.offset <= end + 1
				)
		)
			return visit(rule)
	})
}

async function compileEntryFresh(config, rootSelector, checkedSources) {
	const startedAt = Date.now()
	const revision = config.sourceRevision
	const refreshed = await prepareSourceRefresh(config, revision, checkedSources)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	if (refreshed?.unchanged) {
		config.sourceCache = refreshed.sourceCache
		config.sourceSignatures = refreshed.sourceSignatures
		config.localStylesRevision = revision
		if (config.buildSourceRevision != null) config.buildSourceRevision = revision
		config.sourceChangePending = false
		debugLog(config, 'Tailwind entry reused: candidates and imports unchanged')
		return config.compiledEntryResult
	}
	// 候选或构建依赖变化后重置 Tailwind 内部集合，删除的 utility 也不能残留。
	config.tailwindCompiler = null
	config.registerClassName = createClassNameRegistry()
	const expanded = await getExpandedEntry(config)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	const dependencies = new Set(expanded.dependencies)
	const source = expanded.source
	debugLog(
		config,
		`Tailwind compile start: entry=${config.entry}; source=${source.toString().length}`
	)
	let initialResult = await compileTailwindInput(config, source)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	const directories = new Map()
	collectTailwindDependencies(initialResult, dependencies, directories)
	const directoryDependencies = [...directories.values()]
	// 当前扫描范围立即参与监听，归属和输出在全部异步工作完成后再发布。
	config.dependencies = dependencies
	config.directoryDependencies = directoryDependencies
	// 先保存签名并读取候选；仅实体转义额外产生候选时补编译，普通入口仍只编译一次。
	const sourceSignatures = await getDependencySignatures({
		...config,
		dependencies,
		directoryDependencies
	})
	const preparedCache = await collectSourceCache([...dependencies], {
		sourceCache: refreshed?.sourceCache ?? config.sourceCache,
		signatures: sourceSignatures,
		conditionContext: config.conditionContext,
		customAttributes: config.customAttributes
	})
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	const encodedCandidates = new Set(
		[...preparedCache.records.values()].flatMap((record) => [...record.encodedCandidates])
	)
	if (encodedCandidates.size > 0)
		walkTailwindUtilityRules(initialResult.root, (rule) => {
			for (const selector of postcss.list.comma(rule.selector)) {
				// 只接受完整单类选择器；关系和伪类规则不足以证明同名候选已生成。
				const match = selector.match(
					/^\.((?:\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[\t\n\f\r ])?|[^\n\f\r0-9a-fA-F])|[a-zA-Z0-9_\u0080-\uffff-])+)$/
				)
				if (match != null) encodedCandidates.delete(decodeCssClassName(match[1]))
			}
			if (encodedCandidates.size === 0) return false
		})
	if (encodedCandidates.size > 0)
		initialResult = await compileTailwindInput(config, source, encodedCandidates)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	const normalizedRoot = await normalizeTailwindAnimations(initialResult.root, config)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	const {
		classNames: generatedClassNames,
		originalCandidates,
		compiledRules,
		root: globalRoot,
		utilityRules
	} = collectGeneratedClassNames(normalizedRoot, config, rootSelector)
	const generatedCandidates = new Set(
		[...generatedClassNames].map((name) => originalCandidates.get(name) ?? name)
	)
	// 归属仅使用 Tailwind 实际扫描文件，不能重新纳入 @source not 排除项。
	const { sourceCache, ...styles } = await collectLocalStyles(
		[...dependencies],
		generatedCandidates,
		source,
		{
			appFile: config.appFile,
			resolveImport: config.resolveImport,
			componentLocalStyles: config.componentLocalStyles,
			conditionContext: config.conditionContext,
			customAttributes: config.customAttributes,
			sourceCache: preparedCache,
			signatures: sourceSignatures
		}
	)
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	if (config.componentLocalStyles && styles.unownedFiles.length > 0)
		debugLog(
			config,
			`未分配 SFC 的扫描来源（不自动生成全局 utility）：${styles.unownedFiles.join(', ')}`
		)
	// 从实际生成全集减去明确的全局集合，包含无主脚本及其他扫描来源，避免隐式全局残留。
	const excludedCandidates = config.componentLocalStyles
		? new Set(
				[...generatedCandidates].filter(
					(candidate) => !styles.globalCandidates.has(candidate)
				)
			)
		: styles.applyOnlyCandidates
	const localStyles = config.componentLocalStyles
		? { ...styles, compiledRules }
		: { aliasesByFile: new Map() }
	const excludedNames = new Set([...excludedCandidates].map(toSafeClassName))
	// 仅裁剪有 Tailwind 来源证据的 utility 规则，保留局部 @apply 依赖的主题变量和基础定义。
	// 若重新用排除后的候选编译，Tailwind 会同时删除仅被局部工具类引用的主题变量。
	for (const [rule, selectors] of utilityRules) {
		const kept = [...selectors].filter(([, name]) => !excludedNames.has(name))
		if (kept.length > 0) rule.selector = kept.map(([selector]) => selector).join(', ')
		else {
			let parent = rule.parent
			rule.remove()
			while (parent?.type === 'atrule' && parent.nodes?.length === 0) {
				const next = parent.parent
				parent.remove()
				parent = next
			}
		}
	}
	warnIfNativeDarkVariantRemoved(initialResult.css, config, config.entry)
	const css = globalRoot.toString()
	// 旧编译只能等待最新结果，不能把旧候选标记为最新版本。
	if (config.sourceRevision !== revision) return compileEntry(config, rootSelector)
	config.sourceOwners = styles.ownersByFile
	config.localStyles = localStyles
	config.localStylesRevision = revision
	if (config.buildSourceRevision != null) config.buildSourceRevision = revision
	config.sourceSignatures = sourceSignatures
	config.sourceCache = sourceCache
	config.sourceChangePending = false
	debugLog(
		config,
		`Tailwind compile done: css=${css.length}; local=${
			config.localStyles?.aliasesByFile.size ?? 0
		}; deps=${dependencies.size}; duration=${Date.now() - startedAt}ms`
	)
	config.compiledEntryResult = {
		css,
		dependencies: [...dependencies],
		keyframes: collectTailwindKeyframes(globalRoot)
	}
	return config.compiledEntryResult
}

/** 只复用完整成功的入口；先更新源码，再确认样式输入及扫描边界均未变化。 */
async function prepareSourceRefresh(config, revision, checkedSources) {
	if (
		config.compiledEntryResult == null ||
		config.sourceCache == null ||
		config.sourceSignatures == null ||
		config.expandedEntry == null
	)
		return null
	// 配置和插件可执行任意脚本，不能仅根据 class 候选判断其输出。
	let hasCodeDependency = false
	config.expandedEntry.source.walkAtRules(/^(?:config|plugin)$/, () => {
		hasCodeDependency = true
	})
	if (hasCodeDependency) return null
	const previousCache = config.sourceCache
	const previousSignatures = config.sourceSignatures
	// 同一版本直接消费入口请求刚检查的快照，不重复遍历目录和 stat。
	const sourceSignatures =
		checkedSources?.revision === revision
			? checkedSources.signatures
			: await getDependencySignatures(config)
	if (config.sourceRevision !== revision) return null
	if (sourceSignatures.size !== previousSignatures.size) return null
	for (const [file, signature] of sourceSignatures) {
		if (!previousSignatures.has(file)) return null
		if (signature === previousSignatures.get(file)) continue
		if (!previousCache.records.has(normalizePath(resolve(file)))) {
			if (config.expandedEntry.files.some((dependency) => isSamePath(dependency, file)))
				config.expandedEntry = null
			return null
		}
	}
	const sourceCache = await collectSourceCache([...config.dependencies], {
		sourceCache: previousCache,
		signatures: sourceSignatures,
		conditionContext: config.conditionContext,
		customAttributes: config.customAttributes
	})
	return {
		sourceCache,
		sourceSignatures,
		unchanged: !sourceCache.stylesChanged && sourceCache.resolveImport === config.resolveImport
	}
}

async function compileTailwindInput(config, source, encodedCandidates = new Set()) {
	const input = source.clone()
	if (encodedCandidates.size > 0)
		input.append(
			postcss.atRule({
				name: 'source',
				params: `inline(${JSON.stringify([...encodedCandidates].join(' '))})`
			})
		)
	// Tailwind 通过入口 CSS 内容缓存扫描结果；版本标记和排除列表变化后必须重建。
	const revision = `uniappx-tailwind scan revision ${config.sourceRevision}`
	input.prepend(postcss.comment({ text: revision }))
	input.source = {
		...input.source,
		input: new postcss.Input(input.toString(), { from: config.entry })
	}
	const result = await postcss([getTailwindCompiler(config)]).process(input, {
		from: config.entry
	})
	result.root.walkComments((node) => {
		if (node.text === revision) node.remove()
	})
	return result
}

function collectTailwindDependencies(result, dependencies, directories) {
	for (const message of result.messages) {
		if (message.type === 'dependency' && typeof message.file === 'string')
			dependencies.add(resolve(message.file))
		if (message.type === 'dir-dependency' && typeof message.dir === 'string') {
			const dir = resolve(message.dir)
			const glob = typeof message.glob === 'string' ? message.glob : '**/*'
			directories.set(`${dir}\0${glob}`, {
				dir,
				glob,
				match: picomatch(glob, { dot: true }),
				maxDepth: glob.includes('**') ? Infinity : glob.split('/').length - 1
			})
		}
	}
}

function collectGeneratedClassNames(root, config, rootSelector) {
	const originalCandidates = new Map()
	const sanitized = sanitize(
		tailwindCalculations(root, config),
		{
			...config,
			rootSelector,
			// 在唯一一次清洗中登记原始类名，同时保留冲突检查与局部归属映射。
			registerCssClassName(candidate) {
				config.registerClassName(candidate)
				originalCandidates.set(toSafeClassName(candidate), candidate)
			}
		},
		config.entry
	)
	const classNames = new Set()
	const compiledRules = new Map()
	const utilityRules = new Map()
	walkTailwindUtilityRules(sanitized, (rule) => {
		for (const selector of postcss.list.comma(rule.selector)) {
			const match = selector.match(/^\.([a-zA-Z0-9_-]+)/)
			if (match == null) continue
			classNames.add(match[1])
			if (!utilityRules.has(rule)) utilityRules.set(rule, new Map())
			utilityRules.get(rule).set(selector, match[1])
			if (!config.componentLocalStyles) continue
			let output = rule.clone({ selector })
			for (let parent = rule.parent; parent?.type === 'atrule'; parent = parent.parent) {
				const wrapper = parent.clone({ nodes: [] })
				wrapper.append(output)
				output = wrapper
			}
			compiledRules.set(match[1], (compiledRules.get(match[1]) ?? '') + output.toString())
		}
	})
	return { classNames, originalCandidates, compiledRules, root: sanitized, utilityRules }
}

async function getExpandedEntry(config) {
	if (config.expandedEntry != null) return config.expandedEntry
	const revision = config.sourceRevision
	const dependencies = new Set()
	const source = await expandLocalCssImports(config.entry, config, dependencies)
	const expanded = { source, dependencies: [...dependencies], files: [...dependencies] }
	if (config.sourceRevision === revision) config.expandedEntry = expanded
	return expanded
}

/** Tailwind 读取入口时不会经过 uni:pre；先展开本地 CSS 并执行同等条件编译。 */
async function expandLocalCssImports(file, config, dependencies, seen = new Set()) {
	const normalizedFile = resolve(file)
	if (seen.has(normalizedFile)) return postcss.root()
	seen.add(normalizedFile)
	dependencies.add(normalizedFile)
	// 首次读取期间也参与失效判断，避免旧内容与保存后的新签名一起进入缓存。
	config.dependencies.add(normalizedFile)
	let source = await readFile(normalizedFile, 'utf8')
	source = filterConditions(source, config.conditionContext, normalizedFile)
	// 只处理真实的 @import 节点，注释和字符串中的示例不参与文件读取。
	const root = postcss.parse(source, { from: normalizedFile })
	// 展开后 Tailwind 按入口定位路径；将扫描路径锚定到声明它的 CSS 文件。
	root.walkAtRules('source', (node) => {
		const match = node.params.match(/^(not\s+)?(['"])([^'"]+)\2\s*$/)
		if (match == null) return
		node.params = `${match[1] ?? ''}${JSON.stringify(resolve(dirname(normalizedFile), match[3]).replace(/\\/g, '/'))}`
	})
	const imports = []
	root.walkAtRules('import', (node) => imports.push(node))
	for (const node of imports) {
		const match = node.params.match(/^(['"])(\.\.?[\\/][^'"]+)\1\s*$/)
		if (match == null) continue
		const importedFile = resolve(dirname(normalizedFile), match[2])
		const imported = await expandLocalCssImports(importedFile, config, dependencies, seen)
		node.replaceWith(imported.nodes)
	}
	return root
}

function extractCssModule(code) {
	const viteCss = code.match(/(?:const|let|var) __vite__css\s*=\s*("(?:\\.|[^"\\])*")/)
	const inlineCss = code.match(/export default ("(?:\\.|[^"\\])*")(?=\s*;?\s*$)/)
	const value = viteCss?.[1] ?? inlineCss?.[1]
	return value == null ? null : { value, css: JSON.parse(value) }
}

export default uniAppXTailwind
