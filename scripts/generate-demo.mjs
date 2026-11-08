import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, delimiter, resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const parent = resolve(process.env.UNIAPPX_RELEASE_HOST_PARENT ?? join(root, 'demo-output'))
await mkdir(parent, { recursive: true })
const hostPath = join(parent, 'demo-app')
// 重建生成目录，避免同版本 tarball 的安装缓存和旧构建文件影响检查。
await rm(hostPath, { recursive: true, force: true })
await mkdir(hostPath)
const host = await realpath(hostPath)
const packageRoot = root
const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const manager = process.argv.includes('--npm') ? 'npm' : 'pnpm'
// npm 的 CLI 也由当前 Node/Helper 运行，避免 shebang 切换到另一个 Node。
const npmCli = await realpath(
	execFileSync(process.platform === 'win32' ? 'where' : 'which', ['npm'], {
		encoding: 'utf8'
	})
		.trim()
		.split(/\r?\n/)[0]
)
const npm = (args, cwd) =>
	execFileSync(process.execPath, [npmCli, ...args], {
		cwd,
		env: process.env,
		encoding: 'utf8'
	})

await cp(join(packageRoot, 'test/demo-template'), host, { recursive: true })
const packed = JSON.parse(
	npm(['pack', '--json', '--ignore-scripts', '--pack-destination', host], packageRoot)
)
assert.equal(packed.length, 1)
const publishedFiles = packed[0].files.map((file) => file.path)
for (const file of [
	'index.mjs',
	'tailwind.css',
	'src/class-runtime.mjs',
	'README.md',
	'LICENSE',
	'CHANGELOG.md'
])
	assert.ok(publishedFiles.includes(file), `发布包缺少 ${file}`)
assert.ok(
	publishedFiles.every(
		(file) =>
			!/^(test\/|scripts\/|demo-output\/|AGENTS\.md$|PUBLISHING\.md$|node_modules\/|dist\/|unpackage\/|\.)/.test(
				file
			)
	),
	'发布包包含测试、作者说明或生成文件'
)
const tarball = join(host, packed[0].filename)
const manifest = {
	name: 'tao-tailwindx-demo',
	version: metadata.version,
	type: 'module',
	private: true,
	devDependencies: {
		[metadata.name]: `file:./${packed[0].filename}`
	}
}
await writeFile(join(host, 'package.json'), JSON.stringify(manifest, null, '\t') + '\n')
if (manager === 'npm')
	npm(['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund'], host)
else {
	const pnpm = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['pnpm'], {
		encoding: 'utf8'
	})
		.trim()
		.split(/\r?\n/)[0]
	execFileSync(pnpm, ['install', '--ignore-scripts', '--no-frozen-lockfile'], {
		cwd: host,
		// 安装器与验收进程使用同一 Node 架构，避免 native optional dependency 不匹配。
		env: { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH },
		stdio: 'inherit'
	})
}

const hostRequire = createRequire(join(host, 'package.json'))
const installedEntry = hostRequire.resolve(metadata.name)
assert.ok(installedEntry.startsWith(join(host, 'node_modules') + '/'))
assert.deepEqual(Object.keys(manifest.devDependencies), [metadata.name])
// 从安装后的宿主验证示例使用的静态导入，避免误用源码项目中的包。
execFileSync(
	process.execPath,
	[
		'--input-type=module',
		'--eval',
		`import assert from 'node:assert/strict';
import { uniAppXTailwind } from 'tao-tailwindx';
assert.ok(Array.isArray(uniAppXTailwind()));`
	],
	{ cwd: host, stdio: 'inherit' }
)
// pnpm 不将 Tailwind 单独安装到宿主；宿主位于源码工程内时，解析仍可能命中祖先依赖。
if (manager === 'pnpm')
	await assert.rejects(readFile(join(host, 'node_modules/tailwindcss/package.json')), {
		code: 'ENOENT'
	})
const { uniAppXTailwind, parseThemeValues } = await import(pathToFileURL(installedEntry))
assert.equal(parseThemeValues('page { --brand: #2563eb; }').get('light:page:--brand'), '#2563eb')
await writeFile(
	join(host, 'tailwind.css'),
	(await readFile(join(host, 'tailwind.css'), 'utf8')) +
		'\n@theme inline { --spacing: 1px; --text-lg: 18px; --text-lg--line-height: 28px; }\n'
)
await writeFile(
	join(host, '.npmignore'),
	'node_modules/\nunpackage/\n.hbuilderx/\npackage-lock.json\npnpm-lock.yaml\n'
)
await writeFile(
	join(host, 'README.md'),
	'# Tao Tailwind X 示例\n\n' +
		'插件通过随工程附带的 npm tarball 安装。\n\n' +
		'解压后执行 pnpm install，再用 HBuilder V 或 HBuilderX 打开工程并运行。\n\n' +
		'npm 正式发布后，也可改为 pnpm add -D tao-tailwindx。Vite 与 CSS 均通过包名接入。\n'
)
const previousPlatform = process.env.UNI_PLATFORM
try {
	for (const platform of [
		'web',
		'app-android',
		'app-ios',
		'app-harmony',
		'mp-weixin',
		'mp-alipay'
	]) {
		process.env.UNI_PLATFORM = platform
		const plugins = uniAppXTailwind({ entry: join(host, 'tailwind.css') })
		const css = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-app-style')
		const result = await css.transform.call(
			{ addWatchFile() {} },
			"@import './tailwind.css';",
			join(host, 'App.uvue') + '?vue&type=style&index=0&lang.css'
		)
		assert.match(result.code, /--brand:\s*#2563eb/)
		assert.doesNotMatch(result.code, /\.text-lg\s*\{|\.text-brand\s*\{/)
		assert.doesNotMatch(result.code, /@apply/)
		assert.match(result.code, platform === 'web' ? /:root\s*\{/ : /page\s*\{/)
		const page = join(host, 'pages/index.uvue')
		const classes = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-important-class')
		const local = await classes.transform(await readFile(page, 'utf8'), page)
		assert.match(local.code, /\.text-lg\s*\{/)
		assert.match(local.code, /\.text-brand\s*\{/)
		const apply = plugins.find((plugin) => plugin.name === 'uniappx-tailwind-apply-fallback')
		const applied = await apply.transform(
			'.label { @apply text-brand p-4; }',
			join(host, 'pages/index.uvue') + '?vue&type=style&index=0&lang.css'
		)
		assert.match(applied.code, /var\(--brand\)/)
		assert.match(
			applied.code,
			platform === 'web' ? /padding:\s*calc\(1px \* 4\)/ : /padding:\s*4px/
		)
		assert.doesNotMatch(applied.code, /@apply|@reference/)
	}
} finally {
	if (previousPlatform == null) delete process.env.UNI_PLATFORM
	else process.env.UNI_PLATFORM = previousPlatform
}
console.log(`${manager} 单包安装及公开入口 Node 检查通过：${host}`)
console.log(`产物：${tarball}`)
console.log('检查覆盖静态导入与插件样式处理；完整项目编译与真机运行需另行验证。')
