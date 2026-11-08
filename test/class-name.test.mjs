import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeCssClassName, toSafeClassName } from '../src/class-name.mjs'
import { uniAppXTailwind } from '../src/index.mjs'
import { sanitize } from '../src/sanitize.mjs'

const templatePlugin = (options = {}) =>
	uniAppXTailwind(options).find((plugin) => plugin.name === 'uniappx-tailwind-important-class')

test('恢复可读短名，保留普通 class、前缀、负号和下划线', () => {
	for (const [name, expected] of [
		['p-0!', 'p-0-important'],
		['p-1.5', 'p-1dot5'],
		['a_b!', 'a_b-important'],
		['dark:text-white', 'dark-text-white'],
		['text-[#fff]', 'text-fff'],
		['text-(--brand)', 'text-brand'],
		['w-1/2', 'w-1-2'],
		['h-[40%]', 'h-40-percent'],
		['custom:mt-[-1.5px]!', 'custom-mt-neg-1dot5px-important']
	]) {
		assert.equal(toSafeClassName(name), expected)
		assert.equal(toSafeClassName(expected), expected)
	}
	assert.notEqual(toSafeClassName('h-[40%]'), toSafeClassName('h-40'))
	for (const name of ['p-0', 'p-0-important', '-mt-4', 'app-tag__text', 'a--b', 'a_b', '']) {
		assert.equal(toSafeClassName(name), name)
	}
})

test('已确认的负号和小数回归保持不同短名', () => {
	for (const [left, right, expectedLeft, expectedRight] of [
		['-mt-[1px]', 'mt-[1px]', '-mt-1px', 'mt-1px'],
		['mt-[-1px]', 'mt-[1px]', 'mt-neg-1px', 'mt-1px'],
		['w-[1.5px]', 'w-[1-5px]', 'w-1dot5px', 'w-1-5px'],
		['p-1.5', 'p-1-5', 'p-1dot5', 'p-1-5'],
		['mt-[-.5px]', 'mt-[.5px]', 'mt-neg-dot5px', 'mt-dot5px']
	]) {
		assert.equal(toSafeClassName(left), expectedLeft)
		assert.equal(toSafeClassName(right), expectedRight)
		assert.notEqual(toSafeClassName(left), toSafeClassName(right))
	}
})

test('短名允许与自定义 class 相同，不声明绝对无碰撞', () => {
	for (const [name, custom] of [
		['p-0!', 'p-0-important'],
		['dark:text-white', 'dark-text-white'],
		['w-[1.5px]', 'w-1dot5px']
	]) {
		assert.equal(toSafeClassName(name), toSafeClassName(custom))
	}
})

test('CSS 转义解码与原始模板归一化分离，支持十六进制及其终止空白', () => {
	for (const source of ['p-0\\!', 'p-0\\21 ', 'p-0\\000021']) {
		assert.equal(decodeCssClassName(source), 'p-0!')
	}
	assert.equal(decodeCssClassName('x\\1f600 '), 'x\ud83d\ude00')
	assert.equal(decodeCssClassName('x\\0 '), 'x\ufffd')
	assert.equal(decodeCssClassName('x\\110000'), 'x\ufffd')
	assert.equal(decodeCssClassName('x\\\ny'), 'xy')
	assert.equal(toSafeClassName(String.raw`p-1\2e 5`), 'p-1-2e-5')
	assert.equal(toSafeClassName(decodeCssClassName(String.raw`p-1\2e 5`)), 'p-1dot5')
})

test('单 class selector 消费完整 hex escape 及一个终止空白', () => {
	for (const [selector, name] of [
		[String.raw`.p-1\2e 5`, 'p-1.5'],
		[String.raw`.\31 0px`, '10px'],
		[String.raw`.p-1\00002e5`, 'p-1.5'],
		['.p-1\\2e\t5', 'p-1.5'],
		['.p-1\\2e\n5', 'p-1.5'],
		['.p-1\\2e\r\n5', 'p-1.5'],
		[String.raw`.a\3e b`, 'a>b'],
		[String.raw`.a\+b`, 'a+b'],
		[String.raw`.a\[b\]`, 'a[b]'],
		[String.raw`.a\#b`, 'a#b'],
		[String.raw`.a\.b`, 'a.b'],
		[String.raw`.a\:b`, 'a:b'],
		[String.raw`.a\,b`, 'a,b'],
		[String.raw`.a\\\>b`, String.raw`a\>b`]
	]) {
		for (const allowEscapedSelectors of [false, true]) {
			const output = sanitize(`${selector} { width: 1px; }`, {
				allowEscapedSelectors
			})
			assert.equal(output.nodes.length, 1, selector)
			assert.equal(output.first.selector, `.${toSafeClassName(name)}`, selector)
			assert.equal(output.first.first.prop, 'width', selector)
			assert.equal(output.first.first.value, '1px', selector)
		}
	}
})

test('真实后代、关系、复合选择器和反斜杠后的关系符不能被归一化成单 class', () => {
	for (const selector of [
		String.raw`.p-1\2e 5 .child`,
		String.raw`.p-1\2e  5`,
		String.raw`.\31 0px > .child`,
		String.raw`.a\+b + .child`,
		String.raw`.a\[b\] ~ .child`,
		String.raw`.a\.b.child`,
		String.raw`.a\\>child`,
		String.raw`.a\\+child`,
		String.raw`.a\\:hover`,
		String.raw`.a\\[name]`,
		String.raw`.a\\#id`
	]) {
		for (const allowEscapedSelectors of [false, true]) {
			const css = `${selector} { width: 1px; }`
			assert.equal(sanitize(css, { allowEscapedSelectors }).toString(), '', selector)
			assert.equal(sanitize(css, { strict: false }).toString(), css, selector)
		}
	}
})

test('dark 后缀仅跟随一个 class，hex escape 不阻挡合法 dark selector', () => {
	const suffix = ':where(.dark, .dark *)'
	const output = sanitize(String.raw`.dark\3a p-1\2e 5${suffix} { width: 1px; }`, {
		allowDarkVariantSelectors: true
	}).toString()
	assert.equal(output, `.${toSafeClassName('dark:p-1.5')}${suffix} { width: 1px; }`)
	for (const selector of [
		String.raw`.dark\:p-1\.5 .child${suffix}`,
		String.raw`.dark\:p-1\.5${suffix} .child`,
		String.raw`.dark\:p-1\.5.child${suffix}`,
		String.raw`.dark\:p-1\.5${suffix} > .child`
	]) {
		assert.equal(
			sanitize(`${selector} { width: 1px; }`, {
				allowEscapedSelectors: true,
				allowDarkVariantSelectors: true
			}).toString(),
			'',
			selector
		)
	}
})

test('模板和 CSS 使用一致短名，覆盖小数、正负 arbitrary、分数和 important', () => {
	const names = [
		'p-1.5',
		'p-1-5',
		'-mt-[1px]',
		'mt-[1px]',
		'mt-[-1px]',
		'w-[1.5px]',
		'w-[1-5px]',
		'h-[40%]',
		'w-1/2',
		'p-0!',
		'a_b!'
	]
	const code = `<view class="${names.join(' ')} flex-row app-tag__text" />`
	const plugin = templatePlugin()
	const output = plugin.transform(code, 'pages/collision.uvue').code
	assert.equal(
		output,
		`<view class="${names.map((name) => toSafeClassName(name)).join(' ')} flex-row app-tag__text" />`
	)
	const css = names
		.map(
			(name) =>
				`.${name.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)} { width: 1px; }`
		)
		.join('\n')
	const result = sanitize(css).toString()
	for (const name of names)
		assert.ok(result.includes(`.${toSafeClassName(name)} { width: 1px; }`))
	assert.equal(sanitize(result).toString(), result)
	assert.equal(plugin.transform(output, 'pages/collision.uvue'), null)
	assert.equal(plugin.transform(code, 'pages/collision.uvue').code, output)
})

test('动态索引静态 class 数组时只转换绑定，保留所有候选原值', () => {
	const code = `<view :class="buttonStyle" /><script setup lang="ts">
const buttonColors = ['bg-[#ff2f92]', 'bg-[#0433ff]']
const buttonStyle = computed(() => buttonColors[num.value % buttonColors.length])
</script>`
	const output = templatePlugin().transform(code, 'pages/dynamic-class.uvue').code
	assert.ok(output.includes(':class="__twClass(buttonStyle)"'))
	assert.ok(output.includes("'bg-[#ff2f92]'"))
	assert.ok(output.includes("'bg-[#0433ff]'"))
})

test('所有 class 上下文重复输入幂等，不依赖模块路径或完整输出缓存', () => {
	const normalized = toSafeClassName('p-0!')
	const plugin = templatePlugin({ customAttributes: { '*': ['pt', /Class$/] } })
	for (const code of [
		`<view class="${normalized}" />`,
		`<view hover-class="${normalized}" />`,
		`<view :class="active ? '${normalized}' : 'p-0'" />`,
		`<view :pt="{ root: '${normalized}' }" />`,
		`<view titleClass="${normalized}" />`,
		`<view :class="styleClass" /><script>const styleClass = computed(() => '${normalized}')</script>`,
		`<view :pt="styles" /><script>const styles = { root: '${normalized}' }</script>`,
		`<view :pt="{ root: styleClass }" /><script>const styleClass = computed(() => '${normalized}')</script>`
	]) {
		const first = plugin.transform(code, 'pages/first.uvue')
		assert.deepEqual(plugin.transform(code, 'pages/second.uvue'), first)
		assert.deepEqual(
			templatePlugin({ customAttributes: { '*': ['pt', /Class$/] } }).transform(
				code,
				'pages/new.uvue'
			),
			first
		)
		if (first) assert.equal(plugin.transform(first.code, 'pages/first.uvue'), null)
	}
	assert.equal(
		plugin.transform(
			`<view title="p-0!" /><script>const message = 'mt-[-1px]'</script>`,
			'pages/text.uvue'
		),
		null
	)
	const output = plugin.transform('<view class="p-0!" />', 'pages/first.uvue').code
	assert.equal(plugin.transform(output, 'pages/first.uvue'), null)
	assert.equal(plugin.transform(output, 'pages/second.uvue'), null)
	assert.equal(plugin.transform(output.replace('/>', 'id="new" />'), 'pages/first.uvue'), null)
	assert.equal(plugin.transform('<view class="p-0" />', 'pages/first.uvue'), null)
	assert.equal(plugin.transform(output, 'pages/first.uvue'), null)
})

test('同一字符串被多个已配置上下文遍历时不会重复归一化', () => {
	const code = `<view :class="styleClass" :pt="{ root: styleClass }" /><script>const styleClass = computed(() => 'p-0! p-1.5')</script>`
	const result = templatePlugin({ customAttributes: { '*': ['pt'] } }).transform(
		code,
		'pages/references.uvue'
	)
	assert.ok(result.code.includes("'p-0! p-1.5'"))
	assert.ok(result.code.includes(':class="__twClass(styleClass)"'))
	assert.ok(result.code.includes(':pt="__twPt({ root: styleClass })"'))
})

test('全局配置与列表项的 PT 保留原值，独立脚本不做转换', () => {
	const code = `const config = {
		props: { badge: { value: 'Hot!', pt: { root: 'w-1/2', text: 'text-[#fff]!' } } },
		options: [{ name: '双11!', pt: { activeText: 'text-red-500!' } }]
	}`
	const plugin = templatePlugin({ customAttributes: { '*': ['pt'] } })
	for (const id of [
		'config/props.ts',
		'config/props.ts?version=1',
		'config/props.uts',
		'pages/options.uvue'
	]) {
		assert.equal(plugin.transform(code, id), null)
	}
	assert.equal(templatePlugin().transform(code, 'config/props.uts'), null)
	assert.equal(
		templatePlugin({ customAttributes: { 'app-dialog': ['pt'] } }).transform(
			code,
			'config/props.uts'
		),
		null
	)
})
