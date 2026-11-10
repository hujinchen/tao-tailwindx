# Tao Tailwind X 维护约定

`src/` 存放核心实现，`index.mjs` 与 `tailwind.css` 是公开入口。

- 保持公共 API 与配置兼容，改动聚焦，优先已有依赖。新增第三方依赖、破坏公共 API 或配置兼容性、调整目录结构或架构分层前须确认；不保留无明确需求的兼容分支。
- Tailwind CSS 与其 PostCSS 插件保持相同固定版本，依赖变更同步锁文件。升级检查见 `PUBLISHING.md`，Windows 回归不能替代 macOS 软链接目录扫描验证。
- 日常检查按风险选择，复用 `test/`：文档修改检查对应文件格式；代码修改运行相关测试，核心样式生成、扫描、监听或依赖变更运行完整回归。
- 发布前运行 `pnpm test`、`pnpm run format:check`、`pnpm run test:package` 与 `pnpm run test:package --npm`，具体流程见 `PUBLISHING.md`。
- 支持 HBuilder V（HV）与 HBuilderX（HX）。完整 Vite watcher 与原生 CSS 编译验证使用目标 IDE 对应的配套 SDK，配置方式见 `PUBLISHING.md`；Vite、Vapor 编译器与依赖解析路径须来自同一套 SDK。验证时注明 IDE 与 SDK 版本及跳过项，跳过的测试不算通过。
- `.uvue` 示例使用 TypeScript 与 Composition API，目标端编译与运行验证不能由 Node 单测替代。
- 示例修改放在 `test/demo-template/`，保留平台条件并同步模板 README；示例生成脚本会清空并重建目标工程目录。
- Prettier 是格式标准，日常格式化聚焦修改文件，避免混入无关改动；不直接修改 `node_modules/`、`dist/`、`unpackage/` 或 `demo-output/` 生成内容。
- 对外功能、配置、兼容性或使用方式变化时，同步相关文档与 `CHANGELOG.md`；内部重构、测试和脚本维护通常不写入更新日志。日志按变化类型记录用户影响，保留必要的兼容性与验证边界。
- 非发布任务不自行调整包版本或发布日期；待发布变化记入“未发布”，正式发布时核对 `package.json` 版本与实际发布日期。发布文件由 `package.json.files` 控制。
- 保留协作者未提交改动。Git 初始化、暂存、提交、推送由用户自行执行；npm 发布需要用户明确授权。
