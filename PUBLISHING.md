# Tao Tailwind X 开发与发布

源码直接使用 ESM，无需额外打包。
本文件供维护者使用，不进入 npm 发布包。

## 项目结构

- `index.mjs`：公开的 Vite 插件入口，以及 Node 构建用主题解析导出。
- `tailwind.css`：公开 CSS 入口，在包内解析 Tailwind 依赖。
- `src/`：编译、扫描、class 转换、CSS 适配与主题导出实现。
- `test/`：Node 回归；`test/demo-template/` 是 uni-app x 示例工程模板。
- `scripts/generate-demo.mjs`：实际打包插件，在生成的示例工程中检查安装、静态导入、六端样式与 `@apply`。
- `README.md`、`CONFIGURATION.md`、`STYLE-GENERATION.md`：用户接入与配置说明。
- `CHANGELOG.md`、`LICENSE`：版本记录与 MIT 许可。

## 日常迭代

使用 Node.js 22.13+，在本项目目录执行：

Tailwind 与其 PostCSS 插件固定为 4.3.3。升级时同时修改两项版本，并运行完整回归与 npm、pnpm 安装检查；4.3.5 在 macOS 软链接扫描目录中会重复返回路径，现有回归可检测到重复解析。

```bash
pnpm install
pnpm test
pnpm run format:check
pnpm run test:package
pnpm run test:package --npm
```

`pnpm test` 在没有对应编译器时会明确跳过 Vite watcher 与原生 CSS 编译检查；跳过不表示平台验证通过。
完成完整检查时，先用 HBuilder V 打开测试宿主，使用该 IDE 配套 SDK，并设置以下环境变量后再执行 `pnpm test`：

| 环境变量                      | SDK 中的目标                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `UNIAPPX_TEST_VITE_IMPORT`    | `uniapp-cli-vite/node_modules/vite/dist/node/index.js`                                            |
| `UNIAPPX_TEST_VAPOR_COMPILER` | `uniapp-cli-vite/node_modules/@dcloudio/uni-cli-shared/lib/dom2/app/@vue/compiler-vapor-dom2`     |
| `NODE_PATH`                   | `uniapp-cli-vite/node_modules` 与其 `@dcloudio/uni-cli-shared/lib/dom2/app`；用系统路径分隔符连接 |

这些路径位于 SDK 的 `plugins/` 下。HBuilder V 使用 `code --locate-extension dcloud.hbuilderx-uniapp-sdk` 定位当前 SDK，避免写死扩展版本。
发布检查以 `test/demo-template/` 为模板，将当前源码打包后安装到示例工程中。默认输出到固定目录 `demo-output/demo-app/`，命令结束时打印工程和 tarball 的绝对路径；用 HBuilder V 打开该工程即可运行示例。
每次运行会清空并重新生成该目录，包括已安装依赖和构建产物，确保使用本次打包的源码。需要保留的示例修改应放在 `test/demo-template/`，不要保存在生成目录中。
输出父目录可以通过环境变量修改，目录不存在时自动创建；其下的工程目录名仍固定为 `demo-app`：

```bash
UNIAPPX_RELEASE_HOST_PARENT="$HOME/Desktop/tao-tailwindx-demos" pnpm run test:package
```

生成工程仅声明本地 tarball，内部依赖由包管理器安装；正式发布前即可运行。`demo-output/` 不参与 Git、格式检查或 npm 发布。
生成宿主的 `package.json` 设置 `"type": "module"`，`vite.config.js` 使用顶部静态导入，与接入文档一致。

## 发布到 npm

更新 `package.json` 的版本与 `CHANGELOG.md`，完成上述检查后，在本项目目录执行：

```bash
npm login
npm publish --dry-run
npm publish --access public
npm view tao-tailwindx@<版本> version
```

核对 dry-run 的文件列表、名称与版本。`files` 只包含入口、核心源码、用户文档、许可和更新日志，测试、脚本、依赖目录及本地配置不进入发布包。
账号必须启用 npm 发布要求的二步验证。邮箱登录验证码不等于账号已启用 2FA；出现相关 `E403` 时，由账号持有人在 npm 官方设置页绑定安全密钥，并自行保存恢复码，再继续发布。
已发布的版本不能覆盖，后续更新必须递增版本。有真实公开仓库后再填写 `repository`，不要填示例地址。
发布需要用户明确授权；认证时由用户在官方页面完成二次验证。

`npm publish` 返回成功后，仍需确认提交版本实际可安装。npm 可能先显示 `0.0.0-stage` 和 “Temporary Holding Version”，表示正式版本正在审核；此时等待审核放行，不重复发布相同版本，也不要把业务依赖切换为占位版本。

## 在业务项目验收

正式发布后，业务项目执行 `pnpm add -D tao-tailwindx@<版本>`，Vite 与 CSS 都通过包名接入。
发布前，可以在本项目执行 `npm pack`，再到业务项目执行 `pnpm add -D /绝对路径/tao-tailwindx-<版本>.tgz` 验证安装；验证完成后将依赖声明恢复为正式 npm 版本。
需要边改边联调时，临时执行 `pnpm link /绝对路径/tao-tailwindx`；这种开发链接不用于正式分发，验收仍使用实际 tarball。
Git 初始化、暂存、提交与推送由维护者自行处理。
