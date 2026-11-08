import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { normalizeClassValues } from '../src/class-values.mjs'
import { createClassNameRegistry, toSafeClassName } from '../src/class-name.mjs'
import { normalizeBindings, normalizeClass, normalizePt } from '../src/class-runtime.mjs'
import { createConditionContext, filterConditions } from '../src/conditions.mjs'
import { scanSfc } from '../src/sfc.mjs'

const normalize = (code) => normalizeClassValues(code, { '*': ['pt'] }, createClassNameRegistry())

test('模板插值中的标签文案保持原样，真实 class 继续转换', () => {
	const example = `{{ '<view class="p-[13px]" pt="m-4!">' }}`
	const source = `<template><text>${example}</text><view class="p-[13px]" /></template>`
	const result = normalize(source)
	assert.ok(result.includes(example))
	assert.ok(result.includes('<view class="p-13px" />'))
	assert.equal(normalize(result), result)
})

test('v-pre 中花括号之间的真实标签仍转换，结束后恢复插值跳过', () => {
	const example = `{{ '<view class="p-[13px]">' }}`
	for (const content of [
		'<view v-pre>{{ <view class="p-[13px]"/> }}</view>',
		'<Input v-pre>{{ <view class="p-[13px]"/> }}</Input>',
		'<view v-pre><view>{{ <view class="p-[13px]"/> }}</view></view>',
		'<view v-pre="">{{ <input class="p-[13px]"> }}</view>'
	]) {
		const source = `<template>${content}<input v-pre><text>${example}</text><view class="m-[14px]" /></template>`
		const result = normalize(source)
		assert.ok(result.includes('class="p-13px"'))
		assert.ok(result.includes(example))
		assert.ok(result.includes('class="m-14px"'))
		assert.equal(normalize(result), result)
	}
})

test('class 快速返回保持全部空白及嵌套输入语义，特殊字符继续转换', () => {
	const tokens = [
		't-row',
		'tao-theme-light',
		'flex-row',
		'_item-12',
		'w-[13px]',
		'p-4!',
		'中文',
		'dark:text-white',
		'bg-red/20',
		''
	]
	const whitespace = [' ', '\t', '\r\n', '\f', '\u00a0', '\u2028', '\uFEFF']
	for (const left of tokens)
		for (const right of tokens)
			for (const space of whitespace) {
				const value = `${space}${left}${space}${right}${space}`
				assert.equal(normalizeClass(value), value.replace(/\S+/g, toSafeClassName))
			}
	const value = ['t-row flex-row', null, ['w-[13px]', false], { 'p-4!': true, 'hidden': false }]
	const copy = structuredClone(value)
	assert.equal(normalizeClass(value), 't-row flex-row w-13px p-4-important')
	assert.deepEqual(value, copy)
})

test('同名简写与显式绑定等价，普通布尔属性保持原样', () => {
	const script =
		'<script setup>const pt = { root: "p-4!" }; const hoverClass = "text-xl!"</script>'
	const shorthand = normalize('<template><demo :pt :hover-class disabled /></template>' + script)
	const explicit = normalize(
		'<template><demo :pt="pt" :hover-class="hoverClass" disabled /></template>' + script
	)
	assert.equal(shorthand, explicit)
	assert.equal(normalize(shorthand), shorthand)
})

test('静态 class 的实体空白先解码，动态属性保留表达式语义', () => {
	for (const entity of ['&#32;', '&#x20;', '&#10;', '&Tab;', '&NewLine;', '&nbsp;']) {
		const result = normalize(`<template><view class="p-4!${entity}text-xl!" /></template>`)
		assert.match(result, /class="p-4-important\s+text-xl-important"/)
		assert.equal(normalize(result), result)
	}
	const result = normalize(
		'<template><view :class="ok &amp;&amp; &quot;p-4!&quot;" title="&#32;" /></template>'
	)
	assert.match(result, /__twClass\(\(ok &amp;&amp; &quot;p-4!&quot;\)\)/)
	assert.match(result, /title="&#32;"/)
})

test('完整跳过事件与指令属性值，不改业务字符串中的伪 class 和 PT', () => {
	for (const attribute of [
		'@click',
		'@click.stop',
		'v-on:click',
		'v-on:[event]',
		'#default',
		':title.prop',
		'v-bind:[field]',
		'data-value'
	]) {
		const business = `${attribute}="send(\` class='p-4!' pt='text-xl!' \`)"`
		const source = `<template><view ${business} class="m-2!" /></template>`
		const result = normalize(source)
		assert.ok(result.includes(business), attribute)
		assert.match(result, /class="m-2-important"/)
		assert.equal(normalize(result), result)
	}
})

test('动态实体表达式原样交给 Vue 求值，类名转换不改变比较及函数参数', () => {
	for (const entity of [
		'&copy;',
		'&copy',
		'&nbsp',
		'&notin;',
		'&notit;',
		'&copy=',
		'&amp;copy;',
		'&#128;',
		'&#x80;',
		'&#0;',
		'&#xD800;',
		'&#x110000;'
	]) {
		for (const expression of [
			`label === '${entity}' ? 'p-4!' : 'p-8!'`,
			`choose('${entity}')`,
			`{ 'p-4!': label === '${entity}' }`
		]) {
			const result = normalize(`<template><view :class="${expression}" /></template>`)
			assert.ok(result.includes(`:class="__twClass((${expression}))"`), expression)
			assert.equal(normalize(result), result)
		}
	}
})

test('PT 与对象绑定保留实体业务值，只转义新增的配置参数', () => {
	const expression = "{ root: label === '&copy;' ? 'p-4!' : 'p-8!' }"
	const pt = normalize(`<template><demo :pt="${expression}" /></template>`)
	assert.ok(pt.includes(`:pt="__twPt((${expression}))"`))
	const bindings = `{ class: label === '&copy;' ? 'p-4!' : 'p-8!', title: '&#128;' }`
	const result = normalize(`<template><demo v-bind="${bindings}" /></template>`)
	assert.ok(result.includes(`v-bind="__twBindings((${bindings}), [&quot;pt&quot;])"`))
	assert.equal(normalize(result), result)
	const singleQuoted = normalize(
		`<template><view :class='label === "&copy;" ? "p-4!" : "p-8!"' /></template>`
	)
	assert.ok(singleQuoted.includes(`:class='__twClass((label === "&copy;" ? "p-4!" : "p-8!"))'`))
})

test('动态绑定的逗号表达式保持整体求值，副作用与最终 class 一致', () => {
	for (const expression of ["record('&copy;'), 'p-4!'", "record('text'), 'p-4!'"]) {
		const result = normalize(`<template><view :class="${expression}" /></template>`)
		const argument = result.match(/:class="([^"]+)"/)[1].replace(/&copy;/g, '©')
		const received = []
		const value = runInNewContext(argument, {
			__twClass: normalizeClass,
			record(text) {
				received.push(text)
				return null
			}
		})
		assert.equal(value, 'p-4-important')
		assert.deepEqual(received, [expression.includes('&copy;') ? '©' : 'text'])
		assert.equal(normalize(result), result)
	}
})

test('helper 导入只写入真实 setup，注释和脚本文案中的伪 script 保持原样', () => {
	const template = `<template><view :class="label === '&copy;' ? 'p-4!' : 'p-8!'" /></template>`
	const comment = '<!-- <script setup> -->'
	const commented = normalize(template + comment + "<script setup>const label = '©'</script>")
	assert.ok(commented.includes(comment))
	assert.match(commented, /<script setup>\nimport \{ normalizeClass as __twClass \}/)
	for (const script of [
		"<script>const example = '<script setup>'</script>",
		"<script data-note='setup'>const label = '©'</script>"
	]) {
		const result = normalize(template + script)
		assert.ok(result.includes(script))
		assert.match(result, /<script setup>\nimport \{ normalizeClass as __twClass \}/)
		assert.equal(normalize(result), result)
	}
	const selfClosing = normalize(template + '<script setup/>')
	assert.match(selfClosing, /<script setup>\nimport \{ normalizeClass as __twClass \}/)
	assert.equal(normalize(selfClosing), selfClosing)
})

test('helper 只注入当前平台启用的 setup，新增 setup 继承生效普通脚本的语言', () => {
	const template = `<template><view :class="label === '&copy;' ? 'p-4!' : 'p-8!'" /></template>`
	for (const platform of ['web', 'app-android']) {
		const context = createConditionContext(platform)
		const filter = (source) => filterConditions(source, context, 'Page.uvue')
		for (const setup of [true, false]) {
			const attribute = setup ? ' setup' : ''
			const source = `${template}
<!-- #ifdef APP -->
<script${attribute} lang="uts">const label = 'native'</script>
<!-- #endif -->
<!-- #ifdef WEB -->
<script${attribute} lang="ts">const label = '©'</script>
<!-- #endif -->`
			const result = normalizeClassValues(
				source,
				{ '*': ['pt'] },
				createClassNameRegistry(),
				filter
			)
			const active = filter(result)
			const scripts = scanSfc(active).filter((block) => block.name === 'script')
			const target = scripts.find((block) => /\bsetup\b/.test(block.attributes))
			assert.ok(target)
			assert.match(active.slice(target.contentStart, target.contentEnd), /import \{/)
			assert.ok(target.attributes.includes(platform === 'web' ? 'lang="ts"' : 'lang="uts"'))
			assert.equal(
				normalizeClassValues(result, { '*': ['pt'] }, createClassNameRegistry(), filter),
				result
			)
		}
	}
})

test('关闭重复登记保持静态、动态和 PT 绑定转换结果一致', () => {
	const code = `<template><view class="p-4!" :class="classes" :hover-class="'bg-[#000]'" />
<t-button :pt="pt" v-bind="bindings" /></template>
<script setup>
const classes = ['w-1/2', 'm-2!']
const pt = { text: 'text-[#fff]' }
const bindings = { class: 'h-[12px]', title: 'h-[12px]' }
</script>`
	assert.equal(normalizeClassValues(code, { '*': ['pt'] }, null), normalize(code))
})

test('class 与文案共享候选数组时保留脚本原值和比较条件', () => {
	const script = `const colors = ['bg-[#000]', 'bg-[#00aa00]']
const buttonStyle = computed(() => colors[num.value % colors.length])
const isBlack = computed(() => buttonStyle.value === 'bg-[#000]')`
	const code = `<template><view :class="buttonStyle" /><text>{{ buttonStyle }}</text></template>
<script setup lang="ts">${script}</script>`
	const result = normalize(code)
	assert.ok(result.includes(script))
	assert.ok(result.includes('{{ buttonStyle }}'))
	assert.notEqual(result, code)
})

test('独立脚本中的全局 PT、列表配置和业务字段保留原值', () => {
	const code = `const config = {
		props: { button: { pt: { root: 'p-4!', text: 'text-[#fff]' } } },
		items: [{ pt: { icon: 'w-1/2' }, label: 'hello/world!' }]
	}`
	assert.equal(normalize(code), code)
})

test('没有 setup 时注入的脚本沿用原语言，保留原脚本内容', () => {
	for (const lang of ['', ' lang="js"', ' lang="ts"', ' lang="uts"']) {
		const script = `<script${lang}>export default { data: () => ({ raw: 'bg-[#000]' }) }</script>`
		const result = normalize(`<template><view :class="raw" /></template>${script}`)
		assert.ok(result.includes(script))
		assert.ok(result.includes(`<script setup${lang}>`))
	}
})

test('$attrs 保留编译器的透传入口，class 在父级使用处转换', () => {
	const child =
		'<template><view v-bind="$attrs" :class="rootClass" /></template><script setup>const rootClass = \'p-4!\'</script>'
	const result = normalize(child)
	assert.ok(result.includes('v-bind="$attrs"'))
	assert.ok(result.includes(':class="__twClass(rootClass)"'))
	assert.ok(!result.includes('normalizeBindings'))
	const parent = normalize(
		'<template><child v-bind="options" /></template><script setup>const options = { class: \'bg-[#000]\' }</script>'
	)
	assert.ok(parent.includes('v-bind="__twBindings(options,'))
	assert.ok(parent.includes("class: 'bg-[#000]'"))
})

test('结果分支转换 class，条件、对象条件和文案中的伪代码原样保留', () => {
	const code = `<template><view :class="kind === 'large!' ? 'p-8!' : 'p-4!'" />
	<view :class="{ 'p-12!': kind === 'large!' }" />
	<t-button :pt="{ 'text': kind === 'large!' ? 'text-xl!' : 'text-sm!' }" /></template>
	<script setup>const message = "pt: { text: 'hello/world!' }"</script>`
	const result = normalize(code)
	assert.ok(result.includes("kind === 'large!' ? 'p-8-important' : 'p-4-important'"))
	assert.ok(result.includes("'p-12-important': kind === 'large!'"))
	assert.ok(
		result.includes("'text': kind === 'large!' ? 'text-xl-important' : 'text-sm-important'")
	)
	assert.ok(result.includes(`const message = "pt: { text: 'hello/world!' }"`))
})

test('hoverClass 和 hover-class 的静态配置与动态绑定使用相同规则', () => {
	const result = normalize(`<template><view :hoverClass="raw" />
<t-button v-bind="{ hoverClass: 'p-4!', 'hover-class': 'bg-[#000]', title: 'p-4!' }" /></template>
<script setup>const raw = 'bg-[#000]'</script>`)
	assert.ok(result.includes(':hoverClass="__twClass(raw)"'))
	assert.ok(result.includes("hoverClass: 'p-4-important'"))
	assert.ok(result.includes("'hover-class': 'bg-000'"))
	assert.ok(result.includes("title: 'p-4!'"))
	assert.ok(result.includes("const raw = 'bg-[#000]'"))
})

test('动态 v-bind 键在使用处判断，正则配置不覆盖内置 class 语义', () => {
	const attributes = { '*': [/class/i] }
	const source = `<template><view v-bind="{ [field]: raw, title: raw }" :class="{ 'p-4!': active }" /></template>
<script setup>const raw = 'bg-[#000]'</script>`
	const result = normalizeClassValues(source, attributes, createClassNameRegistry())
	assert.ok(result.includes('v-bind="__twBindings({ [field]: raw, title: raw },'))
	assert.ok(result.includes(':class="{ \'p-4-important\': active }"'))
	const expression = result.match(/v-bind="([^"]+)"/)[1]
	const value = runInNewContext(expression, {
		__twBindings: normalizeBindings,
		field: 'class',
		raw: 'bg-[#000]'
	})
	assert.equal(value.class, 'bg-000')
	assert.equal(value.title, 'bg-[#000]')
})

test('普通变量、ref、带泛型 computed、别名与 v-bind 仅在绑定处转换', () => {
	const code = `<template><view :class="[plain, wrapped, derived]" /><t-button v-bind="alias" /></template>
	<script setup lang="ts">
	const plain = 'p-4!'
	const wrapped = ref('p-8!')
	const derived = computed<string>(() => kind === 'large!' ? 'p-12!' : 'p-16!')
	const pt = { 'text': plain, icon: wrapped }
	const options = { title: 'hello/world!', pt }
	const alias = options
	</script>`
	const result = normalize(code)
	for (const size of [4, 8, 12, 16]) assert.ok(result.includes(`'p-${size}!'`))
	assert.ok(result.includes(':class="__twClass([plain, wrapped, derived])"'))
	assert.ok(result.includes('v-bind="__twBindings(alias,'))
	assert.ok(result.includes("title: 'hello/world!'"))
	assert.ok(result.includes("kind === 'large!'"))
})

test('循环别名停止静态追踪，碰撞同时报告两个原名和安全类名', () => {
	const circular = normalize(`<view :class="a" /><script>const a = b; const b = a</script>`)
	assert.ok(circular.includes('const a = b; const b = a'))
	assert.ok(circular.includes(':class="__twClass(a)"'))
	assert.throws(
		() => normalize('<view class="bg-[url(a/b.png)] bg-[url(a-b.png)]" />'),
		/类名碰撞.*a\/b\.png.*a-b\.png.*bg-url-a-b-png/
	)
	assert.throws(() => normalize('<view class="p-4! p-4-important" />'), /类名碰撞/)
})

test('无分号声明与 getter 返回值止于表达式边界，忽略脚本中的 HTML 文案', () => {
	const code = `<view :class="[plain, derived]" /><script setup>
	const plain = 'p-4!' as string
	log('hello/world!')
	const derived = computed(() => {
		if (kind === 'large!') return 'p-8!'
		return 'p-12!'
	})
	</script>`
	const result = normalize(code)
	for (const size of [4, 8, 12]) assert.ok(result.includes(`'p-${size}!'`))
	assert.ok(result.includes("log('hello/world!')"))
	const text = `const message = '<view class="p-4!" />'`
	assert.equal(normalize(text), text)
})

test('reactive 对象的 PT 与 class 绑定保持原对象及业务字段', () => {
	const code = `<template>
		<t-button :pt="buttonState" />
		<view :class="buttonState.iconClass" />
	</template>
	<script setup>
	const buttonState = reactive({
		pt: { icon: 'text-2xl!', root: active.value ? 'p-4!' : 'p-8!' },
		iconClass: 'text-xl!',
		label: 'hello/world!'
	})
	</script>`
	const result = normalize(code)
	assert.ok(result.includes(':pt="__twPt(buttonState)"'))
	assert.ok(result.includes(':class="__twClass(buttonState.iconClass)"'))
	assert.ok(result.includes("icon: 'text-2xl!'"))
	assert.ok(result.includes("'p-4!'"))
	assert.ok(result.includes("'p-8!'"))
	assert.ok(result.includes("iconClass: 'text-xl!'"))
	assert.ok(result.includes("label: 'hello/world!'"))
})

test('执行转换后的绑定：文案、字符串比较与共享对象保持原值', () => {
	const code = `<template>
		<view :class="classes" :hover-class="raw" />
		<t-button :pt="pt" v-bind="options" />
	</template><script setup>
	const raw = 'bg-[#000]'
	const classes = [raw, { 'p-4!': raw === 'bg-[#000]' }]
	const pt = Object.freeze({ root: raw, nested: Object.freeze({ icon: 'text-xl!' }) })
	const click = () => raw
	const options = Object.freeze({ class: classes, 'hover-class': raw, pt, title: raw, onClick: click })
	</script>`
	const result = normalize(code)
	const script = result
		.match(/<script setup>([\s\S]*?)<\/script>/)[1]
		.replace(/import[^\n]+\n/g, '')
	const attributes = [...result.matchAll(/(?:class|hover-class|pt|v-bind)="([^"]+)"/g)]
	const expressions = attributes.map((match) => match[1].replace(/&quot;/g, '"')).join(', ')
	const values = runInNewContext(
		`${script}\n;({ nodes: [${expressions}], raw, classes, pt, options, equal: raw === 'bg-[#000]' })`,
		{
			__twClass: normalizeClass,
			__twPt: normalizePt,
			__twBindings: normalizeBindings
		}
	)
	assert.equal(values.raw, 'bg-[#000]')
	assert.equal(values.equal, true)
	assert.equal(values.nodes[0], 'bg-000 p-4-important')
	assert.equal(values.nodes[1], 'bg-000')
	assert.equal(values.nodes[2].root, 'bg-000')
	assert.equal(values.nodes[2].nested.icon, 'text-xl-important')
	assert.equal(values.nodes[3].class, 'bg-000 p-4-important')
	assert.equal(values.nodes[3].title, 'bg-[#000]')
	assert.equal(values.nodes[3].onClick, values.options.onClick)
	assert.equal(values.options.pt, values.pt)
	assert.equal(values.pt.root, 'bg-[#000]')
	assert.equal(values.pt.nested.icon, 'text-xl!')
})

test('运行时 class 支持数组、对象键和空态，PT 仅复制发生变化的路径', () => {
	const condition = { 'p-4!': true, 'bg-[#000]': false }
	assert.equal(
		normalizeClass(['w-1/2', condition, null, false, ['p-1.5']]),
		'w-1-2 p-4-important p-1dot5'
	)
	assert.deepEqual(condition, { 'p-4!': true, 'bg-[#000]': false })
	assert.equal(normalizeClass({ 'p-4! text-xl!': true }), 'p-4-important text-xl-important')
	for (const value of [null, false, 0]) assert.equal(normalizeClass(value), '')
	const stable = { icon: 'text-xl' }
	const pt = { root: 'p-4!', nested: stable }
	const converted = normalizePt(pt)
	assert.equal(converted.root, 'p-4-important')
	assert.equal(converted.nested, stable)
	assert.equal(normalizePt(stable), stable)
	assert.equal(normalizeBindings({ title: 'p-4!' }, []).title, 'p-4!')
})

test('模板 class 字符串的 JS 转义在求值后转换，style、文案和比较条件不变', () => {
	const code = `<template><view :class="'p-4!\\ntext-xl!'" :style="{ color: raw }" :title="raw" /></template>
<script setup>const raw = 'bg-[#000]'</script>`
	const result = normalize(code)
	assert.ok(result.includes(':class="__twClass('))
	assert.ok(result.includes(':style="{ color: raw }" :title="raw"'))
	assert.ok(result.includes("const raw = 'bg-[#000]'"))
	const expression = result.match(/:class="([^"]+)"/)[1]
	assert.equal(
		runInNewContext(expression, { __twClass: normalizeClass }),
		'p-4-important\ntext-xl-important'
	)
})

test('运行时 v-bind 按标签配置和正则转换，转换幂等并避开用户同名函数', () => {
	const code = `<template><app-dialog v-bind="options" :class="getClass()" /></template><script setup>
	const __twClass = () => '业务函数'
	const options = { titleClass: 'text-xl!', 'content-class': 'p-4!', title: 'text-xl!' }
	const getClass = () => 'bg-[#000]'
	</script>`
	const attributes = { '*': [/Class$/], 'app-dialog': ['content-class'] }
	const result = normalizeClassValues(code, attributes, createClassNameRegistry())
	assert.ok(result.includes(':class="__twClass1(getClass())"'))
	assert.ok(result.includes('content-class'))
	assert.equal(normalizeClassValues(result, attributes, createClassNameRegistry()), result)
	const options = { 'titleClass': 'text-xl!', 'content-class': 'p-4!', 'title': 'text-xl!' }
	const converted = normalizeBindings(options, [/Class$/, 'content-class'])
	assert.equal(converted.titleClass, 'text-xl-important')
	assert.equal(converted['content-class'], 'p-4-important')
	assert.equal(converted.title, 'text-xl!')
	assert.equal(options.titleClass, 'text-xl!')
})
