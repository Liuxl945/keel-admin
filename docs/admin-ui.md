# 管理后台 UI 规范 —— 完整实现细节

> 管理后台 UI 的完整实现细节。契约条目见 `CLAUDE.md`（前端契约 §5）。
> 改 ProTable / AppDialog / BasicDialog / 布局 / 多页签时读本文件。

## 列表页强制使用 ProTable

- 所有「数据列表 / 表格」页面必须使用 `src/components/ProTable`，
  禁止手写 `<el-table>` + `<el-pagination>` + 查询表单组合。
- 查询走 `searchItems`，列定义走 `columns`，分页/请求/loading/错误兜底由组件接管。
- 服务端排序：列设 `sortable: "custom"`（必要时 `sortParam` 映射后端字段），
  不要自行监听 `sort-change`。
- 多选批量操作：列 `{ type: "selection", label: "", width: 55, fixed: "left" }` +
  `@selection-change` 或 `ref` 取选中；按钮放 `#toolbar` 插槽（文案带数量）。
- 批量操作**走后端批量接口**，不在前端 for 循环调单条；后端语义统一「宽容」。
- 序号列：所有列表带 `{ type: "index", label: "序号", width: 70 }`，放勾选列之后。
- 多级表头：列上加 `children: ProTableColumn[]` 即渲染成两级表头（`label` 作一级分组名，
  children 为二级叶子列，叶子列支持全部列属性），用于同一实体的多列分组
  （如表单预览里同一子表的明细列）。一级分组表头默认居中（`headerAlign: 'center'`），
  需要跟数据列一致时显式传 `headerAlign`；叶子列也支持 `headerAlign` 单独调表头对齐。
- 树形结构 / 看板 / 日历类页面可不套 ProTable，但其中的明细列表仍要用。
- 高度约定：`.page` 默认撑满内容区；ProTable 通过 `composables/useFillHeight.ts`
  测量容器高度，表格占满剩余空间、内部滚动、分页固定底部。
  新增列表页不要给表格写死 `height`，也不要让整个页面外层滚动。
  非 ProTable 的表格（如菜单树）同样复用 `useFillHeight`。

## 弹窗统一用 AppDialog

- 所有模态框必须使用 `src/components/AppDialog`（el-dialog 薄封装，props/事件/插槽
  经 `$attrs` 透传），禁止直接写 `<el-dialog>`。
- 组件内建：内容区 `el-scrollbar` 悬浮滚动、无外部滚动条、顶边距 10vh。
- 形态：`variant="dialog"`（默认，居中弹窗）/ `variant="drawer"`（侧边抽屉，配 `direction`，
  宽度走 `width`）/ `fullscreen`（铺满主内容区，与 BasicDialog 一样只覆盖 `el-main.layout__main`，
  保留侧边栏/顶栏/页签；内容区滚动条填满剩余高度）。
  抽屉切 el-drawer；全屏仍是 el-dialog，遮罩按 `.layout__main` 矩形扣除 `--app-main-padding`
  CSS 变量（定义在 `styles/index.scss`，可用 `--app-main-padding-<side>` 单独覆盖；运行时改变量会自动跟随），
  业务侧不要直接写 `<el-drawer>`。
  全屏模式顶部栏固定为「箭头返回 / 标题 / 取消 / 确认」（header 有 8px 上下内边距），
  `confirm` 事件由业务接保存，不渲染 `#footer`；
  普通弹窗/抽屉仍用 `#footer` 放操作按钮。
- 全局已配 `dialog: { draggable: true }`，不要在单个弹窗重复加 `draggable`。
- **例外**：整页内容型弹窗统一使用 `src/components/BasicDialog`，它只覆盖主内容区，
  保留侧边栏/顶栏/多页签；普通表单弹窗仍必须使用 AppDialog。
  - 结构：顶部 `#back` / `#title` / `#center` / `#actions` 插槽 + 中间默认插槽 + 可选 `#footer` 插槽；
    `#center` 按头部宽度绝对居中，适合放步骤条等状态信息；
  - 内置「返回」按钮触发 `@back`，需要离开确认时由业务页面自行处理；
  - `BasicDialog` 基于 `el-dialog` 封装，`fullscreen` 开启覆盖内容区的全屏模式，
    `mask` / `maskColor` 控制遮罩；普通弹窗属性继续按 el-dialog 透传；
  - **与 AppDialog 共用 padding 规则**：两者定位统一走 `src/utils/app-main-padding.ts` 的
    `mainContentBox()`——按 `.layout__main` 矩形扣除 `--app-main-padding`（含四边单侧覆盖），
    遮罩/弹窗落在内容区内部不贴边；`layout/index.vue` 的 `.layout__main` padding 也用同一组变量，
    改变量（含运行时 `document.documentElement.style.setProperty`）两处弹窗同时跟随。
  - **关闭不闪**：AppDialog / BasicDialog 关闭时都不在 `watch` 里立即清空遮罩定位样式，
    统一等 el-dialog 的 `@closed`（动画结束）再 `unbindOverlay`，避免动画期间弹窗跳回默认位置闪一下；
    keep-alive 失活（BasicDialog `onDeactivated`）等不走 closed 的场景需主动清理。
  - **首次打开不铺满整屏**：`bindOverlay()` 只解绑 observer/resize 监听，不再先调 `unbindOverlay()`
    清空已有定位（否则重绑前会有一帧整屏遮罩）；`updateOverlayRect()` 在 `.layout__main`
    还没渲染时**不回落到整个视口**；teleport 的遮罩或主内容区任一未就绪时，
    `requestAnimationFrame` 重试几帧再定位，两个组件（AppDialog / BasicDialog）规则一致。
  - **遮罩类名必须每实例唯一**（`useId()`），禁止模块级自增种子：路由懒加载会把组件打进
    多个 chunk、模块副本各自从 1 计数，实例间类名撞车后 `querySelector` 会定位到别的实例的
    隐藏遮罩，弹窗宽度完全不被计算（从 `/dev/form` 跳到 `/dev/form/preview/:id` 必现，直接刷新正常）。
  - 页面被 keep-alive 缓存时，弹窗会随 `onDeactivated` 自动关闭并清理遮罩
    （AppDialog 的弹窗 `append-to-body` teleport 到 body，页面切走不会自动隐藏，会残留到其他页面；
    BasicDialog 弹窗留在页面 DOM 内，随页面一起隐藏，只做遮罩样式清理）。
    **防闪烁**：失活时先同步把遮罩 `display:none`（跳过 el-dialog 淡出动画）再 emit 关闭，
    否则淡出动画会在新页面上闪一下；切回页面时弹窗为关闭态，由用户重新打开。

## 滚动区域统一用 el-scrollbar

- 需要滚动的区域一律 `<el-scrollbar>`，禁止裸写 `overflow-y: auto`。
- 高度链：flex 容器里给宿主写 `flex: 1; min-height: 0`；调色走 `--el-scrollbar-*` 变量。

## 时间展示统一口径

- 后台展示时间一律经过 `src/utils/datetime.ts`，禁止直接渲染接口原始字符串：
  - 日期时间用 `formatDateTime(value)` → `YYYY-MM-DD HH:mm`；
    只有日志这类需要秒的场景传 `withSeconds = true`。
  - 纯日期语义用 `formatDate(value)` → `YYYY-MM-DD`。
  - 只要时刻用 `formatClock(value)` → `HH:mm`。
- **禁止** `replace('T', ' ').slice(...)`：后端是 UTC ISO 字符串，直接截会差 8 小时。
- ProTable 列要用 `slot` 渲染，不要用 `prop` 绕过格式化。
- 回填 `el-date-picker` 用 `toLocalDateTimeInput(value)`。

## 移动端可用（录入/核销类页面）

- 开卡、充值、核销、录入这类「工作人员可能在手机上操作」的写操作页面
  必须手机浏览器可用：Element Plus 响应式、单列布局、一屏录完。
- 子列表（如会员选择器）在手机端要有搜索 + 大点击区，不做横向滚动表格。
- 纯管理页（菜单、角色、日志）不强制移动端适配。

## 多页签、主题与深色模式

- 动态路由组件路径来自后端 `component`，经 `import.meta.glob('../views/**/*.vue')` 解析；**找不到组件时落 404，不要静默空白**。
- 多页签：`stores/tagsView.ts` 在 `router.afterEach` 收集已访问页面，
  首页 `/dashboard` 固定不可关闭；退出登录时清空，避免串账号。
- 页面缓存：Layout 使用 `<keep-alive :include="cachedViews">`，只缓存当前打开页签对应的组件；
  关闭页签 / 关闭其他 / 关闭全部会同步释放缓存。
  页面组件必须写 `defineOptions({ name: 'SystemUser' })`，名称规则 =
  组件路径去掉 `/index` 后按目录 PascalCase 拼接（`system/user/index` → `SystemUser`，
  `dashboard/index` → `Dashboard`）；未按约定命名的页面不会被缓存。
- 被缓存的页面不会重复触发 `onMounted`，筛选、分页、表单等状态会保留；
  需要刷新数据时调用 ProTable 的 `reload()`，不要依赖重新挂载。
- 主题：`stores/settings.ts` 持久化主色与深色模式到 localStorage，
  修改时同步写入 `--el-color-primary*` 变量；深色模式依赖 `html.dark` +
  `element-plus/theme-chalk/dark/css-vars.css`。
- 新增页面容器使用 `var(--el-bg-color)` / `var(--el-text-color-primary)` 等变量，
  不要写死 `#fff` / `#1f2d3d`，否则深色模式下会出现白块或黑字看不见。
- 界面设置入口在顶栏齿轮图标，使用 `el-drawer`（非模态弹窗，不强制 AppDialog）。
