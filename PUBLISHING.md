# Tao Tailwind X 开发与发布

维护者使用，本文不进入 npm 发布包。源码为 ESM，无需构建。

## 发布前检查

使用 Node.js 22.13+，在项目根目录执行：

```bash
pnpm install
pnpm test
pnpm run format:check
pnpm run test:package
pnpm run test:package --npm
```

Tailwind 与其 PostCSS 插件保持相同固定版本；升级时运行完整检查，并在 macOS 验证软链接目录扫描，Windows 回归不能替代该检查。

### SDK 配置

完整 Vite watcher 与原生 CSS 检查需要 HBuilder V（HV）或 HBuilderX（HX）的配套 SDK。设置以下环境变量后执行 `pnpm test`：

| 环境变量                      | SDK 中的目标                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `UNIAPPX_TEST_VITE_IMPORT`    | `uniapp-cli-vite/node_modules/vite/dist/node/index.js`                                            |
| `UNIAPPX_TEST_VAPOR_COMPILER` | `uniapp-cli-vite/node_modules/@dcloudio/uni-cli-shared/lib/dom2/app/@vue/compiler-vapor-dom2`     |
| `NODE_PATH`                   | `uniapp-cli-vite/node_modules` 与其 `@dcloudio/uni-cli-shared/lib/dom2/app`；用系统路径分隔符连接 |

以上路径相对于 SDK 的 `plugins/` 目录：

- HV：运行对应的 `code --locate-extension dcloud.hbuilderx-uniapp-sdk`，使用返回目录下的 `plugins/`。
- HX：使用安装目录中的 `plugins/`；macOS 在应用包内定位。

三个变量必须指向同一套 SDK。记录实测 IDE、SDK 版本与跳过项；缺少 SDK 时跳过的测试不算通过。App 使用配套 uni-app x 编译器 5.31+，启用 Vapor；完整工程编译和设备运行需另行验收。

## 生成示例

`pnpm run test:package` 将当前源码打包并安装到 `demo-output/tailwind-uniappx-demo/`，检查静态导入、六端样式与 `@apply`，最后打印检查结果、示例工程和本地安装包路径，并说明安装包用途及后续验证步骤。用 HV 或 HX 打开生成工程运行。

每次执行都会清空并重建工程目录，示例修改请放在 `test/demo-template/`，保留平台条件并同步模板 README。`demo-output/` 不参与 Git、格式检查或 npm 发布。

可通过 `UNIAPPX_RELEASE_HOST_PARENT` 修改输出父目录，工程名仍为 `tailwind-uniappx-demo`：

```bash
UNIAPPX_RELEASE_HOST_PARENT="$HOME/Desktop/tao-tailwindx-demos" pnpm run test:package
```

Windows PowerShell 对应写法：

```powershell
$env:UNIAPPX_RELEASE_HOST_PARENT = "$env:USERPROFILE/Desktop/tao-tailwindx-demos"
pnpm run test:package
```

## 发布到 npm

更新 `package.json` 版本与 `CHANGELOG.md`，完成检查并取得用户明确授权后发布。已发布版本不能覆盖。

先确认 registry 为官方源；以下设置会保存，默认源已正确时无需重复设置：

```bash
npm config get registry
npm config set registry https://registry.npmjs.org/
```

确认输出为 `https://registry.npmjs.org/` 后登录并预检：

```bash
npm login
npm whoami
npm publish --dry-run
```

`npm whoami` 返回用户名即登录成功。核对 dry-run 的包名、版本和文件列表，发布内容由 `package.json.files` 控制，再执行：

```bash
npm publish --access public
npm view tao-tailwindx@<版本> version
```

## 在业务项目验收

发布前用生成的 tarball 验收：`pnpm add -D /绝对路径/tao-tailwindx-<版本>.tgz`。发布后改为 `pnpm add -D tao-tailwindx@<版本>`，Vite 与 CSS 按 [README.md](README.md) 通过包名接入。

Git 初始化、暂存、提交与推送由维护者自行处理。
