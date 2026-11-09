# Tao Tailwind X 维护约定

`src/` 存放核心实现，`index.mjs` 与 `tailwind.css` 是公开入口。

- 保持公共 API 与配置兼容，改动聚焦；优先已有依赖，不新增第三方依赖或兼容分支。
- 测试按风险选择，复用 `test/`，发布前运行 `pnpm test`、`pnpm run format:check` 与 `pnpm run test:package`；npm 安装检查添加 `--npm`。
- 支持 HBuilder V（HV）与 HBuilderX（HX）。完整 Vite watcher 与原生 CSS 编译验证使用目标 IDE 对应的配套 SDK，配置方式见 `PUBLISHING.md`；Vite、Vapor 编译器与依赖解析路径须来自同一套 SDK。验证时注明 IDE 与 SDK 版本，测试被跳过时明确报告。
- `.uvue` 示例使用 TypeScript 与 Composition API，目标端编译与运行验证不能由 Node 单测替代。
- Prettier 是格式标准；不修改 `node_modules/`、`dist/` 或 `unpackage/` 生成内容。
- 更新代码时同步相关文档与 `CHANGELOG.md`，发布文件由 `package.json.files` 控制。
- 保留协作者未提交改动。Git 初始化、暂存、提交、推送由用户自行执行；npm 发布需要用户明确授权。
