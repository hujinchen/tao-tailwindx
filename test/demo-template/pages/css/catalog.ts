/** 官方 CSS 属性与可直接扫描的完整 Tailwind class；不要动态拼接工具类。 */
export type CssCase = { value: string; className: string; note: string }
export type CssDemo = {
	property: string
	title: string
	kind: string
	category: string
	description: string
	support: string
	cases: CssCase[]
}

export const cssDemos: CssDemo[] = [
	{
		property: 'align-content',
		title: '多行交叉轴对齐',
		kind: 'align-content',
		category: '弹性布局',
		description: '容器有两行且保留交叉轴空余空间。stretch 的子项不设置固定高度。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'center', className: 'content-center', note: '' },
			{ value: 'flex-start', className: 'content-start', note: '' },
			{ value: 'flex-end', className: 'content-end', note: '' },
			{ value: 'space-between', className: 'content-between', note: '' },
			{ value: 'space-around', className: 'content-around', note: '' },
			{ value: 'stretch', className: 'content-stretch', note: '' }
		]
	},
	{
		property: 'align-items',
		title: '子项交叉轴对齐',
		kind: 'align-items',
		category: '弹性布局',
		description: '蓝色元素是观察对象；stretch 需要不设置交叉轴固定尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'center', className: 'items-center', note: '' },
			{ value: 'flex-start', className: 'items-start', note: '' },
			{ value: 'flex-end', className: 'items-end', note: '' },
			{ value: 'stretch', className: 'items-stretch', note: '' },
			// #ifdef WEB
			{ value: 'baseline', className: 'items-baseline', note: '基线对齐仅在 Web 演示' }
			// #endif
		]
	},
	{
		property: 'align-self',
		title: '单个子项对齐',
		kind: 'align-self',
		category: '弹性布局',
		description: '蓝色元素是观察对象；stretch 需要不设置交叉轴固定尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'auto', className: 'self-auto', note: '' },
			{ value: 'center', className: 'self-center', note: '' },
			{ value: 'flex-start', className: 'self-start', note: '' },
			{ value: 'flex-end', className: 'self-end', note: '' },
			{ value: 'stretch', className: 'self-stretch', note: '' },
			// #ifdef WEB
			{ value: 'baseline', className: 'self-baseline', note: '基线对齐仅在 Web 演示' }
			// #endif
		]
	},
	{
		property: 'justify-content',
		title: '主轴空间分配',
		kind: 'justify',
		category: '弹性布局',
		description: '三个固定宽度的子项在同一行中排列，观察它们之间的空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'center', className: 'justify-center', note: '' },
			{ value: 'flex-start', className: 'justify-start', note: '' },
			{ value: 'flex-end', className: 'justify-end', note: '' },
			{ value: 'space-between', className: 'justify-between', note: '' },
			{ value: 'space-around', className: 'justify-around', note: '' },
			{ value: 'space-evenly', className: 'justify-evenly', note: '' }
		]
	},
	{
		property: 'flex-direction',
		title: '主轴方向',
		kind: 'direction',
		category: '弹性布局',
		description: '编号保持 1、2、3，观察方向和排列顺序。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'row', className: 'flex-row', note: '' },
			{ value: 'row-reverse', className: 'flex-row-reverse', note: '' },
			{ value: 'column', className: 'flex-col', note: '' },
			{ value: 'column-reverse', className: 'flex-col-reverse', note: '' }
		]
	},
	{
		property: 'flex-wrap',
		title: '换行与反向换行',
		kind: 'wrap',
		category: '弹性布局',
		description: '六个子项的总宽度超过容器，均禁止收缩。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'nowrap', className: 'flex-nowrap', note: '' },
			{ value: 'wrap', className: 'flex-wrap', note: '' },
			{ value: 'wrap-reverse', className: 'flex-wrap-reverse', note: '' }
		]
	},
	{
		property: 'flex-flow',
		title: '方向与换行简写',
		kind: 'wrap',
		category: '弹性布局',
		description: '一次设置主轴方向与换行方式，使用 Tailwind 任意属性语法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'row nowrap', className: '[flex-flow:row_nowrap]', note: '' },
			{ value: 'row wrap', className: '[flex-flow:row_wrap]', note: '' },
			{ value: 'row wrap-reverse', className: '[flex-flow:row_wrap-reverse]', note: '' },
			{ value: 'row-reverse wrap', className: '[flex-flow:row-reverse_wrap]', note: '' },
			{ value: 'column wrap', className: '[flex-flow:column_wrap]', note: '' },
			{ value: 'column-reverse wrap', className: '[flex-flow:column-reverse_wrap]', note: '' }
		]
	},
	{
		property: 'flex',
		title: '弹性尺寸简写',
		kind: 'flex',
		category: '弹性布局',
		description: '蓝色子项与灰色参照项共享一行；观察伸展与收缩。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '1 1 0%', className: 'flex-1', note: '' },
			{ value: '1 1 auto', className: 'flex-auto', note: '' },
			{ value: '0 1 auto', className: 'flex-initial', note: '' },
			{ value: 'none', className: 'flex-none', note: '' },
			{ value: '2 1 80px', className: 'flex-[2_1_80px]', note: '' }
		]
	},
	{
		property: 'flex-grow',
		title: '剩余空间增长',
		kind: 'grow',
		category: '弹性布局',
		description: '三个子项初始宽度相同，蓝色子项使用当前增长系数，其他项固定为 1。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0', className: 'grow-0', note: '' },
			{ value: '1', className: 'grow', note: '' },
			{ value: '2', className: 'grow-2', note: '' },
			{ value: '3', className: 'grow-3', note: '' },
			{ value: '0.5', className: 'grow-[0.5]', note: '' }
		]
	},
	{
		property: 'flex-shrink',
		title: '溢出时收缩',
		kind: 'shrink',
		category: '弹性布局',
		description: '三个子项的初始总宽度超过容器，蓝色子项使用当前收缩系数。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0', className: 'shrink-0', note: '' },
			{ value: '1', className: 'shrink', note: '' },
			{ value: '2', className: 'shrink-2', note: '' },
			{ value: '3', className: 'shrink-3', note: '' },
			{ value: '0.5', className: 'shrink-[0.5]', note: '' }
		]
	},
	{
		property: 'flex-basis',
		title: '主轴基础尺寸',
		kind: 'basis',
		category: '弹性布局',
		description: '蓝色子项禁止伸缩，观察 px、rpx 与百分比的基础尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'auto', className: 'basis-auto', note: '' },
			{ value: '64px', className: 'basis-64', note: '' },
			{ value: '96px', className: 'basis-[96px]', note: '' },
			{ value: '120rpx', className: 'basis-[120rpx]', note: '' },
			{ value: '50%', className: 'basis-1/2', note: '' },
			// #ifdef WEB
			{ value: 'content', className: 'basis-[content]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'display',
		title: '显示与移除布局',
		kind: 'visibility',
		category: '布局与层级',
		description: '蓝色元素位于两个参照项之间；hidden 对应 display: none，不占位置。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'flex', className: 'flex', note: '' },
			{ value: 'none', className: 'hidden', note: '' }
		]
	},
	{
		property: 'visibility',
		title: '保留位置的隐藏',
		kind: 'visibility',
		category: '布局与层级',
		description: 'invisible 隐藏蓝色元素，但仍保留它在布局中的位置。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'visible', className: 'visible', note: '' },
			{ value: 'hidden', className: 'invisible', note: '' }
		]
	},
	{
		property: 'position',
		title: '定位方式',
		kind: 'position',
		category: '布局与层级',
		description: 'relative、absolute 在预览框内演示；fixed 可通过按钮显示并关闭。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'relative', className: '[position:relative]', note: '' },
			{ value: 'absolute', className: '[position:absolute]', note: '' },
			{ value: 'fixed', className: '[position:fixed]', note: '' },
			// #ifdef WEB
			{ value: 'static', className: '[position:static]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'sticky', className: '[position:sticky]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'top',
		title: '顶部偏移',
		kind: 'offset',
		category: '布局与层级',
		description: '蓝色元素使用 absolute；虚线框是其定位参照容器。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'top-0', note: '' },
			{ value: '24px', className: 'top-24', note: '' },
			{ value: '40px', className: 'top-[40px]', note: '' },
			{ value: '48rpx', className: 'top-[48rpx]', note: '' },
			{ value: '25%', className: 'top-1/4', note: '' },
			{ value: '-12px', className: '-top-12', note: '' },
			{ value: 'auto', className: 'top-auto', note: '' }
		]
	},
	{
		property: 'right',
		title: '右侧偏移',
		kind: 'offset',
		category: '布局与层级',
		description: '蓝色元素使用 absolute；虚线框是其定位参照容器。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'right-0', note: '' },
			{ value: '24px', className: 'right-24', note: '' },
			{ value: '40px', className: 'right-[40px]', note: '' },
			{ value: '48rpx', className: 'right-[48rpx]', note: '' },
			{ value: '25%', className: 'right-1/4', note: '' },
			{ value: '-12px', className: '-right-12', note: '' },
			{ value: 'auto', className: 'right-auto', note: '' }
		]
	},
	{
		property: 'bottom',
		title: '底部偏移',
		kind: 'offset',
		category: '布局与层级',
		description: '蓝色元素使用 absolute；虚线框是其定位参照容器。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'bottom-0', note: '' },
			{ value: '24px', className: 'bottom-24', note: '' },
			{ value: '40px', className: 'bottom-[40px]', note: '' },
			{ value: '48rpx', className: 'bottom-[48rpx]', note: '' },
			{ value: '25%', className: 'bottom-1/4', note: '' },
			{ value: '-12px', className: '-bottom-12', note: '' },
			{ value: 'auto', className: 'bottom-auto', note: '' }
		]
	},
	{
		property: 'left',
		title: '左侧偏移',
		kind: 'offset',
		category: '布局与层级',
		description: '蓝色元素使用 absolute；虚线框是其定位参照容器。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'left-0', note: '' },
			{ value: '24px', className: 'left-24', note: '' },
			{ value: '40px', className: 'left-[40px]', note: '' },
			{ value: '48rpx', className: 'left-[48rpx]', note: '' },
			{ value: '25%', className: 'left-1/4', note: '' },
			{ value: '-12px', className: '-left-12', note: '' },
			{ value: 'auto', className: 'left-auto', note: '' }
		]
	},
	{
		property: 'z-index',
		title: '叠放顺序',
		kind: 'layer',
		category: '布局与层级',
		description: '蓝色与灰色方块重叠，灰色方块的 z-index 为 10。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			// #ifdef WEB
			{ value: 'auto', className: 'z-auto', note: '' },
			// #endif
			{ value: '0', className: 'z-0', note: '' },
			{ value: '10', className: 'z-10', note: '' },
			{ value: '20', className: 'z-20', note: '' },
			{ value: '35', className: 'z-[35]', note: '' },
			{ value: '-1', className: '-z-1', note: '' }
		]
	},
	{
		property: 'overflow',
		title: '超出容器的内容',
		kind: 'overflow',
		category: '布局与层级',
		description:
			'内容高于预览容器；App 的滚动使用 scroll-view，此处只展示 CSS 允许的溢出方式。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'visible', className: 'overflow-visible', note: '' },
			{ value: 'hidden', className: 'overflow-hidden', note: '' },
			// #ifdef WEB
			{ value: 'scroll', className: 'overflow-scroll', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'auto', className: 'overflow-auto', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'clip', className: 'overflow-clip', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'pointer-events',
		title: '点击事件穿透',
		kind: 'pointer',
		category: '布局与层级',
		description: '点击蓝色覆盖层，观察反馈来自覆盖层还是下方按钮。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'auto', className: 'pointer-events-auto', note: '' },
			{ value: 'none', className: 'pointer-events-none', note: '' }
		]
	},
	{
		property: 'box-sizing',
		title: '盒模型尺寸',
		kind: 'box-sizing',
		category: '尺寸与间距',
		description: '声明宽度为 160px，内边距 16px、边框 4px；参照线宽度为 160px。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'border-box', className: 'box-border', note: '' },
			{ value: 'content-box', className: 'box-content', note: '' }
		]
	},
	{
		property: 'width',
		title: '宽度',
		kind: 'size',
		category: '尺寸与间距',
		description: '浅色区域提供明确的父级宽高；auto 按内容或父级布局计算。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'w-64', note: '' },
			{ value: '112px', className: 'w-[112px]', note: '' },
			{ value: '160rpx', className: 'w-[160rpx]', note: '' },
			{ value: '50%', className: 'w-1/2', note: '' },
			{ value: '100%', className: 'w-full', note: '' },
			{ value: 'auto', className: 'w-auto', note: '' },
			{ value: 'var(--demo-size)', className: 'w-(--demo-size)', note: '' },
			{ value: 'calc(48px + 32px)', className: 'w-[calc(48px+32px)]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: 'w-fit', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: 'w-min', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: 'w-max', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'height',
		title: '高度',
		kind: 'size',
		category: '尺寸与间距',
		description: '浅色区域提供明确的父级宽高；auto 按内容或父级布局计算。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'h-64', note: '' },
			{ value: '112px', className: 'h-[112px]', note: '' },
			{ value: '160rpx', className: 'h-[160rpx]', note: '' },
			{ value: '50%', className: 'h-1/2', note: '' },
			{ value: '100%', className: 'h-full', note: '' },
			{ value: 'auto', className: 'h-auto', note: '' },
			{ value: 'var(--demo-size)', className: 'h-(--demo-size)', note: '' },
			{ value: 'calc(48px + 32px)', className: 'h-[calc(48px+32px)]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: 'h-fit', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: 'h-min', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: 'h-max', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'min-width',
		title: '最小宽度',
		kind: 'constraint',
		category: '尺寸与间距',
		description: '最小尺寸使用小于限制值的基础尺寸，最大尺寸使用大于限制值的基础尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'min-w-64', note: '' },
			{ value: '112px', className: 'min-w-[112px]', note: '' },
			{ value: '160rpx', className: 'min-w-[160rpx]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: '[min-width:fit-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: '[min-width:min-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: '[min-width:max-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'auto', className: '[min-width:auto]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'max-width',
		title: '最大宽度',
		kind: 'constraint',
		category: '尺寸与间距',
		description: '最小尺寸使用小于限制值的基础尺寸，最大尺寸使用大于限制值的基础尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'max-w-64', note: '' },
			{ value: '112px', className: 'max-w-[112px]', note: '' },
			{ value: '160rpx', className: 'max-w-[160rpx]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: '[max-width:fit-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: '[max-width:min-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: '[max-width:max-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'none', className: '[max-width:none]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'min-height',
		title: '最小高度',
		kind: 'constraint',
		category: '尺寸与间距',
		description: '最小尺寸使用小于限制值的基础尺寸，最大尺寸使用大于限制值的基础尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'min-h-64', note: '' },
			{ value: '112px', className: 'min-h-[112px]', note: '' },
			{ value: '160rpx', className: 'min-h-[160rpx]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: '[min-height:fit-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: '[min-height:min-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: '[min-height:max-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'auto', className: '[min-height:auto]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'max-height',
		title: '最大高度',
		kind: 'constraint',
		category: '尺寸与间距',
		description: '最小尺寸使用小于限制值的基础尺寸，最大尺寸使用大于限制值的基础尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '64px', className: 'max-h-64', note: '' },
			{ value: '112px', className: 'max-h-[112px]', note: '' },
			{ value: '160rpx', className: 'max-h-[160rpx]', note: '' },
			// #ifdef WEB
			{ value: 'fit-content', className: '[max-height:fit-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'min-content', className: '[max-height:min-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'max-content', className: '[max-height:max-content]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'none', className: '[max-height:none]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'margin',
		title: '外边距',
		kind: 'margin',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。auto 观察可分配的剩余空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'm-0', note: '' },
			{ value: '8px', className: 'm-8', note: '' },
			{ value: '24px', className: 'm-24', note: '' },
			{ value: '18px', className: 'm-[18px]', note: '' },
			{ value: '32rpx', className: 'm-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'm-(--demo-space)', note: '' },
			{ value: '8px 24px', className: '[margin:8px_24px]', note: '' },
			{ value: '8px 16px 24px', className: '[margin:8px_16px_24px]', note: '' },
			{ value: '8px 16px 24px 32px', className: '[margin:8px_16px_24px_32px]', note: '' },
			{ value: '-8px', className: '-m-8', note: '' },
			{ value: 'auto', className: 'm-auto', note: '' }
		]
	},
	{
		property: 'margin-top',
		title: '顶部外边距',
		kind: 'margin',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。auto 观察可分配的剩余空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'mt-0', note: '' },
			{ value: '8px', className: 'mt-8', note: '' },
			{ value: '24px', className: 'mt-24', note: '' },
			{ value: '18px', className: 'mt-[18px]', note: '' },
			{ value: '32rpx', className: 'mt-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'mt-(--demo-space)', note: '' },
			{ value: '-8px', className: '-mt-8', note: '' },
			{ value: 'auto', className: 'mt-auto', note: '' }
		]
	},
	{
		property: 'margin-right',
		title: '右侧外边距',
		kind: 'margin',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。auto 观察可分配的剩余空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'mr-0', note: '' },
			{ value: '8px', className: 'mr-8', note: '' },
			{ value: '24px', className: 'mr-24', note: '' },
			{ value: '18px', className: 'mr-[18px]', note: '' },
			{ value: '32rpx', className: 'mr-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'mr-(--demo-space)', note: '' },
			{ value: '-8px', className: '-mr-8', note: '' },
			{ value: 'auto', className: 'mr-auto', note: '' }
		]
	},
	{
		property: 'margin-bottom',
		title: '底部外边距',
		kind: 'margin',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。auto 观察可分配的剩余空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'mb-0', note: '' },
			{ value: '8px', className: 'mb-8', note: '' },
			{ value: '24px', className: 'mb-24', note: '' },
			{ value: '18px', className: 'mb-[18px]', note: '' },
			{ value: '32rpx', className: 'mb-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'mb-(--demo-space)', note: '' },
			{ value: '-8px', className: '-mb-8', note: '' },
			{ value: 'auto', className: 'mb-auto', note: '' }
		]
	},
	{
		property: 'margin-left',
		title: '左侧外边距',
		kind: 'margin',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。auto 观察可分配的剩余空间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'ml-0', note: '' },
			{ value: '8px', className: 'ml-8', note: '' },
			{ value: '24px', className: 'ml-24', note: '' },
			{ value: '18px', className: 'ml-[18px]', note: '' },
			{ value: '32rpx', className: 'ml-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'ml-(--demo-space)', note: '' },
			{ value: '-8px', className: '-ml-8', note: '' },
			{ value: 'auto', className: 'ml-auto', note: '' }
		]
	},
	{
		property: 'padding',
		title: '内边距',
		kind: 'padding',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'p-0', note: '' },
			{ value: '8px', className: 'p-8', note: '' },
			{ value: '24px', className: 'p-24', note: '' },
			{ value: '18px', className: 'p-[18px]', note: '' },
			{ value: '32rpx', className: 'p-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'p-(--demo-space)', note: '' },
			{ value: '8px 24px', className: '[padding:8px_24px]', note: '' },
			{ value: '8px 16px 24px', className: '[padding:8px_16px_24px]', note: '' },
			{ value: '8px 16px 24px 32px', className: '[padding:8px_16px_24px_32px]', note: '' }
		]
	},
	{
		property: 'padding-top',
		title: '顶部内边距',
		kind: 'padding',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'pt-0', note: '' },
			{ value: '8px', className: 'pt-8', note: '' },
			{ value: '24px', className: 'pt-24', note: '' },
			{ value: '18px', className: 'pt-[18px]', note: '' },
			{ value: '32rpx', className: 'pt-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'pt-(--demo-space)', note: '' }
		]
	},
	{
		property: 'padding-right',
		title: '右侧内边距',
		kind: 'padding',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'pr-0', note: '' },
			{ value: '8px', className: 'pr-8', note: '' },
			{ value: '24px', className: 'pr-24', note: '' },
			{ value: '18px', className: 'pr-[18px]', note: '' },
			{ value: '32rpx', className: 'pr-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'pr-(--demo-space)', note: '' }
		]
	},
	{
		property: 'padding-bottom',
		title: '底部内边距',
		kind: 'padding',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'pb-0', note: '' },
			{ value: '8px', className: 'pb-8', note: '' },
			{ value: '24px', className: 'pb-24', note: '' },
			{ value: '18px', className: 'pb-[18px]', note: '' },
			{ value: '32rpx', className: 'pb-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'pb-(--demo-space)', note: '' }
		]
	},
	{
		property: 'padding-left',
		title: '左侧内边距',
		kind: 'padding',
		category: '尺寸与间距',
		description: '浅色区域标记空间，蓝色区域标记内容。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'pl-0', note: '' },
			{ value: '8px', className: 'pl-8', note: '' },
			{ value: '24px', className: 'pl-24', note: '' },
			{ value: '18px', className: 'pl-[18px]', note: '' },
			{ value: '32rpx', className: 'pl-[32rpx]', note: '' },
			{ value: 'var(--demo-space)', className: 'pl-(--demo-space)', note: '' }
		]
	},
	{
		property: 'background-color',
		title: '背景颜色',
		kind: 'paint',
		category: '背景与效果',
		description: '展示十六进制、RGB、透明色及主题变量；透明色会透出下方背景。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'bg-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'bg-[#0d9488]', note: '' },
			{ value: 'rgb(234,88,12)', className: 'bg-[rgb(234,88,12)]', note: '' },
			{ value: 'rgba(37,99,235,0.35)', className: 'bg-[rgba(37,99,235,0.35)]', note: '' },
			{ value: 'transparent', className: 'bg-transparent', note: '' },
			{ value: 'var(--brand)', className: 'bg-brand', note: '' },
			{ value: 'var(--accent)', className: 'bg-(--accent)', note: '' }
		]
	},
	{
		property: 'color',
		title: '文字颜色',
		kind: 'text',
		category: '背景与效果',
		description: '展示十六进制、RGB、透明色及主题变量；透明色会透出下方背景。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'text-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'text-[#0d9488]', note: '' },
			{ value: 'rgb(234,88,12)', className: 'text-[rgb(234,88,12)]', note: '' },
			{ value: 'rgba(37,99,235,0.35)', className: 'text-[rgba(37,99,235,0.35)]', note: '' },
			{ value: 'transparent', className: 'text-transparent', note: '' },
			{ value: 'var(--brand)', className: 'text-brand', note: '' },
			{ value: 'var(--accent)', className: 'text-(--accent)', note: '' },
			// #ifdef WEB
			{ value: 'currentColor', className: 'text-current', note: '' }
			// #endif
		]
	},
	{
		property: 'background',
		title: '背景简写',
		kind: 'paint',
		category: '背景与效果',
		description: '颜色与线性渐变可用任意属性写法；图片附着方式仅在 Web 演示。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: '[background:#2563eb]', note: '' },
			{
				value: 'rgba(13,148,136,0.4)',
				className: '[background:rgba(13,148,136,0.4)]',
				note: ''
			},
			{
				value: 'linear-gradient(to right,#2563eb,#14b8a6)',
				className: '[background:linear-gradient(to_right,#2563eb,#14b8a6)]',
				note: ''
			},
			// #ifdef WEB
			{
				value: 'fixed',
				className: '[background:linear-gradient(to_right,#2563eb,#14b8a6)_fixed]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'local',
				className: '[background:linear-gradient(to_right,#2563eb,#14b8a6)_local]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'scroll',
				className: '[background:linear-gradient(to_right,#2563eb,#14b8a6)_scroll]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{ value: 'none', className: '[background:none]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'background-image',
		title: '线性渐变背景',
		kind: 'paint',
		category: '背景与效果',
		description: '使用 sRGB 颜色的任意值渐变，对应官方支持的 linear-gradient。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{
				value: 'linear-gradient(to right,#2563eb,#14b8a6)',
				className: 'bg-[linear-gradient(to_right,#2563eb,#14b8a6)]',
				note: ''
			},
			{
				value: 'linear-gradient(to bottom,#2563eb,#14b8a6)',
				className: 'bg-[linear-gradient(to_bottom,#2563eb,#14b8a6)]',
				note: ''
			},
			// #ifdef WEB
			{
				value: 'linear-gradient(45deg,#2563eb,#8b5cf6)',
				className: 'bg-[linear-gradient(45deg,#2563eb,#8b5cf6)]',
				note: ''
			},
			// #endif
			{
				value: 'linear-gradient(to right,#2563eb 0%,#14b8a6 50%,#f59e0b 100%)',
				className: 'bg-[linear-gradient(to_right,#2563eb_0%,#14b8a6_50%,#f59e0b_100%)]',
				note: ''
			},
			{ value: 'none', className: 'bg-none', note: '' }
		]
	},
	{
		property: 'background-clip',
		title: '背景绘制区域',
		kind: 'clip',
		category: '背景与效果',
		description: '半透明粗边框和内边距让三个背景区域的差异可见。',
		support: 'Web；官方 Android 支持范围不适用于当前 Vapor 示例',
		cases: [
			// #ifdef WEB
			{ value: 'border-box', className: 'bg-clip-border', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'padding-box', className: 'bg-clip-padding', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'content-box', className: 'bg-clip-content', note: '' }
			// #endif
		]
	},
	{
		property: 'opacity',
		title: '透明度',
		kind: 'paint',
		category: '背景与效果',
		description: '透明度同时作用于蓝色背景和文字。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0.0', className: 'opacity-0', note: '' },
			{ value: '0.25', className: 'opacity-25', note: '' },
			{ value: '0.5', className: 'opacity-50', note: '' },
			{ value: '0.75', className: 'opacity-75', note: '' },
			{ value: '1.0', className: 'opacity-100', note: '' },
			{ value: '0.35', className: 'opacity-[0.35]', note: '' }
		]
	},
	{
		property: 'box-shadow',
		title: '盒子阴影',
		kind: 'shadow',
		category: '背景与效果',
		description: '使用具体的阴影值，避免多层阴影变量掩盖效果。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{
				value: '0 4px 12px rgba(15,23,42,0.16)',
				className: 'shadow-[0_4px_12px_rgba(15,23,42,0.16)]',
				note: ''
			},
			{ value: '6px 6px 0 #2563eb', className: 'shadow-[6px_6px_0_#2563eb]', note: '' },
			{
				value: '0 0 16px rgba(13,148,136,0.5)',
				className: 'shadow-[0_0_16px_rgba(13,148,136,0.5)]',
				note: ''
			},
			{ value: 'none', className: 'shadow-none', note: '' },
			// #ifdef WEB
			{
				value: 'inset 0 0 12px rgba(15,23,42,0.3)',
				className: 'shadow-[inset_0_0_12px_rgba(15,23,42,0.3)]',
				note: '仅 Web 演示'
			}
			// #endif
		]
	},
	{
		property: 'backdrop-filter',
		title: '背景高斯模糊',
		kind: 'backdrop',
		category: '背景与效果',
		description:
			'半透明覆盖层后方放置彩色文字与色块，便于观察 blur。不对演示元素设置 flatten。',
		support: 'Web / App Vapor 5.25+；部分值存在端差异',
		cases: [
			{ value: 'blur(0px)', className: 'backdrop-blur-[0px]', note: '' },
			{ value: 'blur(4px)', className: 'backdrop-blur-[4px]', note: '' },
			{ value: 'blur(12px)', className: 'backdrop-blur-[12px]', note: '' },
			{ value: 'none', className: '[backdrop-filter:none]', note: '' }
		]
	},
	{
		property: 'border',
		title: '四边边框简写',
		kind: 'border',
		category: '边框与圆角',
		description: '使用任意属性明确声明宽度、样式和颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '1px solid #2563eb', className: '[border:1px_solid_#2563eb]', note: '' },
			{ value: '4px dashed #2563eb', className: '[border:4px_dashed_#2563eb]', note: '' },
			{ value: '6px dotted #0d9488', className: '[border:6px_dotted_#0d9488]', note: '' },
			{ value: 'none', className: '[border:none]', note: '' }
		]
	},
	{
		property: 'border-color',
		title: '四边边框颜色',
		kind: 'border-color',
		category: '边框与圆角',
		description: '先声明实线边框宽度，再替换当前边框颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'border-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'border-[#0d9488]', note: '' },
			{ value: 'rgba(234,88,12,0.5)', className: 'border-[rgba(234,88,12,0.5)]', note: '' },
			{ value: 'transparent', className: 'border-transparent', note: '' },
			// #ifdef WEB
			{ value: 'inherit', className: '[border-color:inherit]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'border-style',
		title: '四边边框样式',
		kind: 'border-style',
		category: '边框与圆角',
		description: '边框宽度固定为 4px，观察实线、虚线、点线和无边框。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'solid', className: 'border-solid', note: '' },
			{ value: 'dashed', className: 'border-dashed', note: '' },
			{ value: 'dotted', className: 'border-dotted', note: '' },
			{ value: 'none', className: 'border-none', note: '' }
		]
	},
	{
		property: 'border-width',
		title: '四边边框宽度',
		kind: 'border-width',
		category: '边框与圆角',
		description: '颜色与样式固定；thin、medium、thick 使用官方枚举写法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'border-0', note: '' },
			{ value: '1px', className: 'border-1', note: '' },
			{ value: '4px', className: 'border-4', note: '' },
			{ value: '8px', className: 'border-8', note: '' },
			{ value: 'thin', className: '[border-width:thin]', note: '' },
			{ value: 'medium', className: '[border-width:medium]', note: '' },
			{ value: 'thick', className: '[border-width:thick]', note: '' },
			{ value: '12rpx', className: 'border-[length:12rpx]', note: '' }
		]
	},
	{
		property: 'border-top',
		title: '上边边框简写',
		kind: 'border',
		category: '边框与圆角',
		description: '使用任意属性明确声明宽度、样式和颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '1px solid #2563eb', className: '[border-top:1px_solid_#2563eb]', note: '' },
			{ value: '4px dashed #2563eb', className: '[border-top:4px_dashed_#2563eb]', note: '' },
			{ value: '6px dotted #0d9488', className: '[border-top:6px_dotted_#0d9488]', note: '' },
			{ value: 'none', className: '[border-top:none]', note: '' }
		]
	},
	{
		property: 'border-top-color',
		title: '上边边框颜色',
		kind: 'border-color',
		category: '边框与圆角',
		description: '先声明实线边框宽度，再替换当前边框颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'border-t-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'border-t-[#0d9488]', note: '' },
			{ value: 'rgba(234,88,12,0.5)', className: 'border-t-[rgba(234,88,12,0.5)]', note: '' },
			{ value: 'transparent', className: 'border-t-transparent', note: '' },
			// #ifdef WEB
			{ value: 'inherit', className: '[border-top-color:inherit]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'border-top-style',
		title: '上边边框样式',
		kind: 'border-style',
		category: '边框与圆角',
		description: '边框宽度固定为 4px，观察实线、虚线、点线和无边框。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'solid', className: '[border-top-style:solid]', note: '' },
			{ value: 'dashed', className: '[border-top-style:dashed]', note: '' },
			{ value: 'dotted', className: '[border-top-style:dotted]', note: '' },
			{ value: 'none', className: '[border-top-style:none]', note: '' }
		]
	},
	{
		property: 'border-top-width',
		title: '上边边框宽度',
		kind: 'border-width',
		category: '边框与圆角',
		description: '颜色与样式固定；thin、medium、thick 使用官方枚举写法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'border-t-0', note: '' },
			{ value: '1px', className: 'border-t-1', note: '' },
			{ value: '4px', className: 'border-t-4', note: '' },
			{ value: '8px', className: 'border-t-8', note: '' },
			{ value: 'thin', className: '[border-top-width:thin]', note: '' },
			{ value: 'medium', className: '[border-top-width:medium]', note: '' },
			{ value: 'thick', className: '[border-top-width:thick]', note: '' },
			{ value: '12rpx', className: 'border-t-[length:12rpx]', note: '' }
		]
	},
	{
		property: 'border-right',
		title: '右边边框简写',
		kind: 'border',
		category: '边框与圆角',
		description: '使用任意属性明确声明宽度、样式和颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '1px solid #2563eb', className: '[border-right:1px_solid_#2563eb]', note: '' },
			{
				value: '4px dashed #2563eb',
				className: '[border-right:4px_dashed_#2563eb]',
				note: ''
			},
			{
				value: '6px dotted #0d9488',
				className: '[border-right:6px_dotted_#0d9488]',
				note: ''
			},
			{ value: 'none', className: '[border-right:none]', note: '' }
		]
	},
	{
		property: 'border-right-color',
		title: '右边边框颜色',
		kind: 'border-color',
		category: '边框与圆角',
		description: '先声明实线边框宽度，再替换当前边框颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'border-r-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'border-r-[#0d9488]', note: '' },
			{ value: 'rgba(234,88,12,0.5)', className: 'border-r-[rgba(234,88,12,0.5)]', note: '' },
			{ value: 'transparent', className: 'border-r-transparent', note: '' },
			// #ifdef WEB
			{ value: 'inherit', className: '[border-right-color:inherit]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'border-right-style',
		title: '右边边框样式',
		kind: 'border-style',
		category: '边框与圆角',
		description: '边框宽度固定为 4px，观察实线、虚线、点线和无边框。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'solid', className: '[border-right-style:solid]', note: '' },
			{ value: 'dashed', className: '[border-right-style:dashed]', note: '' },
			{ value: 'dotted', className: '[border-right-style:dotted]', note: '' },
			{ value: 'none', className: '[border-right-style:none]', note: '' }
		]
	},
	{
		property: 'border-right-width',
		title: '右边边框宽度',
		kind: 'border-width',
		category: '边框与圆角',
		description: '颜色与样式固定；thin、medium、thick 使用官方枚举写法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'border-r-0', note: '' },
			{ value: '1px', className: 'border-r-1', note: '' },
			{ value: '4px', className: 'border-r-4', note: '' },
			{ value: '8px', className: 'border-r-8', note: '' },
			{ value: 'thin', className: '[border-right-width:thin]', note: '' },
			{ value: 'medium', className: '[border-right-width:medium]', note: '' },
			{ value: 'thick', className: '[border-right-width:thick]', note: '' },
			{ value: '12rpx', className: 'border-r-[length:12rpx]', note: '' }
		]
	},
	{
		property: 'border-bottom',
		title: '下边边框简写',
		kind: 'border',
		category: '边框与圆角',
		description: '使用任意属性明确声明宽度、样式和颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{
				value: '1px solid #2563eb',
				className: '[border-bottom:1px_solid_#2563eb]',
				note: ''
			},
			{
				value: '4px dashed #2563eb',
				className: '[border-bottom:4px_dashed_#2563eb]',
				note: ''
			},
			{
				value: '6px dotted #0d9488',
				className: '[border-bottom:6px_dotted_#0d9488]',
				note: ''
			},
			{ value: 'none', className: '[border-bottom:none]', note: '' }
		]
	},
	{
		property: 'border-bottom-color',
		title: '下边边框颜色',
		kind: 'border-color',
		category: '边框与圆角',
		description: '先声明实线边框宽度，再替换当前边框颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'border-b-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'border-b-[#0d9488]', note: '' },
			{ value: 'rgba(234,88,12,0.5)', className: 'border-b-[rgba(234,88,12,0.5)]', note: '' },
			{ value: 'transparent', className: 'border-b-transparent', note: '' },
			// #ifdef WEB
			{ value: 'inherit', className: '[border-bottom-color:inherit]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'border-bottom-style',
		title: '下边边框样式',
		kind: 'border-style',
		category: '边框与圆角',
		description: '边框宽度固定为 4px，观察实线、虚线、点线和无边框。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'solid', className: '[border-bottom-style:solid]', note: '' },
			{ value: 'dashed', className: '[border-bottom-style:dashed]', note: '' },
			{ value: 'dotted', className: '[border-bottom-style:dotted]', note: '' },
			{ value: 'none', className: '[border-bottom-style:none]', note: '' }
		]
	},
	{
		property: 'border-bottom-width',
		title: '下边边框宽度',
		kind: 'border-width',
		category: '边框与圆角',
		description: '颜色与样式固定；thin、medium、thick 使用官方枚举写法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'border-b-0', note: '' },
			{ value: '1px', className: 'border-b-1', note: '' },
			{ value: '4px', className: 'border-b-4', note: '' },
			{ value: '8px', className: 'border-b-8', note: '' },
			{ value: 'thin', className: '[border-bottom-width:thin]', note: '' },
			{ value: 'medium', className: '[border-bottom-width:medium]', note: '' },
			{ value: 'thick', className: '[border-bottom-width:thick]', note: '' },
			{ value: '12rpx', className: 'border-b-[length:12rpx]', note: '' }
		]
	},
	{
		property: 'border-left',
		title: '左边边框简写',
		kind: 'border',
		category: '边框与圆角',
		description: '使用任意属性明确声明宽度、样式和颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '1px solid #2563eb', className: '[border-left:1px_solid_#2563eb]', note: '' },
			{
				value: '4px dashed #2563eb',
				className: '[border-left:4px_dashed_#2563eb]',
				note: ''
			},
			{
				value: '6px dotted #0d9488',
				className: '[border-left:6px_dotted_#0d9488]',
				note: ''
			},
			{ value: 'none', className: '[border-left:none]', note: '' }
		]
	},
	{
		property: 'border-left-color',
		title: '左边边框颜色',
		kind: 'border-color',
		category: '边框与圆角',
		description: '先声明实线边框宽度，再替换当前边框颜色。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '#2563eb', className: 'border-l-[#2563eb]', note: '' },
			{ value: '#0d9488', className: 'border-l-[#0d9488]', note: '' },
			{ value: 'rgba(234,88,12,0.5)', className: 'border-l-[rgba(234,88,12,0.5)]', note: '' },
			{ value: 'transparent', className: 'border-l-transparent', note: '' },
			// #ifdef WEB
			{ value: 'inherit', className: '[border-left-color:inherit]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'border-left-style',
		title: '左边边框样式',
		kind: 'border-style',
		category: '边框与圆角',
		description: '边框宽度固定为 4px，观察实线、虚线、点线和无边框。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'solid', className: '[border-left-style:solid]', note: '' },
			{ value: 'dashed', className: '[border-left-style:dashed]', note: '' },
			{ value: 'dotted', className: '[border-left-style:dotted]', note: '' },
			{ value: 'none', className: '[border-left-style:none]', note: '' }
		]
	},
	{
		property: 'border-left-width',
		title: '左边边框宽度',
		kind: 'border-width',
		category: '边框与圆角',
		description: '颜色与样式固定；thin、medium、thick 使用官方枚举写法。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'border-l-0', note: '' },
			{ value: '1px', className: 'border-l-1', note: '' },
			{ value: '4px', className: 'border-l-4', note: '' },
			{ value: '8px', className: 'border-l-8', note: '' },
			{ value: 'thin', className: '[border-left-width:thin]', note: '' },
			{ value: 'medium', className: '[border-left-width:medium]', note: '' },
			{ value: 'thick', className: '[border-left-width:thick]', note: '' },
			{ value: '12rpx', className: 'border-l-[length:12rpx]', note: '' }
		]
	},
	{
		property: 'border-radius',
		title: '四角圆角',
		kind: 'radius',
		category: '边框与圆角',
		description: '可分别设置四角，百分比圆角依赖元素的实际尺寸。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'rounded-none', note: '' },
			{ value: '8px', className: 'rounded-[8px]', note: '' },
			{ value: '24px', className: 'rounded-[24px]', note: '' },
			{ value: '50%', className: 'rounded-[50%]', note: '' },
			{ value: '9999px', className: 'rounded-full', note: '' },
			{ value: '8px 24px', className: '[border-radius:8px_24px]', note: '' },
			{
				value: '8px 16px 24px 32px',
				className: '[border-radius:8px_16px_24px_32px]',
				note: ''
			},
			{ value: '24rpx', className: 'rounded-[24rpx]', note: '' }
		]
	},
	{
		property: 'border-top-left-radius',
		title: '左上圆角',
		kind: 'radius',
		category: '边框与圆角',
		description: '仅改变当前角，其余三个角保持直角。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'rounded-tl-none', note: '' },
			{ value: '16px', className: 'rounded-tl-[16px]', note: '' },
			{ value: '32px', className: 'rounded-tl-[32px]', note: '' },
			{ value: '50%', className: 'rounded-tl-[50%]', note: '' },
			{ value: '32rpx', className: 'rounded-tl-[32rpx]', note: '' }
		]
	},
	{
		property: 'border-top-right-radius',
		title: '右上圆角',
		kind: 'radius',
		category: '边框与圆角',
		description: '仅改变当前角，其余三个角保持直角。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'rounded-tr-none', note: '' },
			{ value: '16px', className: 'rounded-tr-[16px]', note: '' },
			{ value: '32px', className: 'rounded-tr-[32px]', note: '' },
			{ value: '50%', className: 'rounded-tr-[50%]', note: '' },
			{ value: '32rpx', className: 'rounded-tr-[32rpx]', note: '' }
		]
	},
	{
		property: 'border-bottom-right-radius',
		title: '右下圆角',
		kind: 'radius',
		category: '边框与圆角',
		description: '仅改变当前角，其余三个角保持直角。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'rounded-br-none', note: '' },
			{ value: '16px', className: 'rounded-br-[16px]', note: '' },
			{ value: '32px', className: 'rounded-br-[32px]', note: '' },
			{ value: '50%', className: 'rounded-br-[50%]', note: '' },
			{ value: '32rpx', className: 'rounded-br-[32rpx]', note: '' }
		]
	},
	{
		property: 'border-bottom-left-radius',
		title: '左下圆角',
		kind: 'radius',
		category: '边框与圆角',
		description: '仅改变当前角，其余三个角保持直角。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0px', className: 'rounded-bl-none', note: '' },
			{ value: '16px', className: 'rounded-bl-[16px]', note: '' },
			{ value: '32px', className: 'rounded-bl-[32px]', note: '' },
			{ value: '50%', className: 'rounded-bl-[50%]', note: '' },
			{ value: '32rpx', className: 'rounded-bl-[32rpx]', note: '' }
		]
	},
	{
		property: 'font-family',
		title: '字体族',
		kind: 'font',
		category: '文字排版',
		description: '系统字体族的实际外观取决于设备；uni-icon 单独显示内置图标字符。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'sans-serif', className: '[font-family:sans-serif]', note: '' },
			{ value: 'serif', className: '[font-family:serif]', note: '' },
			{ value: 'monospace', className: '[font-family:monospace]', note: '' },
			{ value: 'cursive', className: '[font-family:cursive]', note: '' },
			{ value: 'fantasy', className: '[font-family:fantasy]', note: '' },
			{ value: 'uni-icon', className: '[font-family:uni-icon]', note: '' }
		]
	},
	{
		property: 'font-size',
		title: '字号',
		kind: 'text',
		category: '文字排版',
		description: '固定数值与任意值均可展示；字号关键字按 Web 字体规范演示。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '14px', className: 'text-sm', note: '' },
			{ value: '16px', className: 'text-base', note: '' },
			{ value: '18px', className: 'text-lg', note: '' },
			{ value: '24px', className: 'text-[24px]', note: '' },
			{ value: '40rpx', className: 'text-[length:40rpx]', note: '' },
			// #ifdef WEB
			{ value: 'xx-small', className: '[font-size:xx-small]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'x-small', className: '[font-size:x-small]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'small', className: '[font-size:small]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'medium', className: '[font-size:medium]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'large', className: '[font-size:large]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'x-large', className: '[font-size:x-large]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'xx-large', className: '[font-size:xx-large]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'xxx-large', className: '[font-size:xxx-large]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'smaller', className: '[font-size:smaller]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'larger', className: '[font-size:larger]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'math', className: '[font-size:math]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'font-style',
		title: '字体样式',
		kind: 'text',
		category: '文字排版',
		description: '同时显示英文与中文，斜体效果受当前系统字体影响。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'normal', className: 'not-italic', note: '' },
			{ value: 'italic', className: 'italic', note: '' }
		]
	},
	{
		property: 'font-weight',
		title: '字重',
		kind: 'text',
		category: '文字排版',
		description: '字重以系统字体实际提供的字形为准。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'normal', className: 'font-normal', note: '' },
			{ value: 'bold', className: 'font-bold', note: '' },
			{ value: '100', className: 'font-thin', note: '' },
			{ value: '200', className: 'font-extralight', note: '' },
			{ value: '300', className: 'font-light', note: '' },
			{ value: '400', className: 'font-[400]', note: '' },
			{ value: '500', className: 'font-medium', note: '' },
			{ value: '600', className: 'font-semibold', note: '' },
			{ value: '700', className: 'font-[700]', note: '' },
			{ value: '800', className: 'font-extrabold', note: '' },
			{ value: '900', className: 'font-black', note: '' }
		]
	},
	{
		property: 'letter-spacing',
		title: '字间距',
		kind: 'text',
		category: '文字排版',
		description: '使用同一行文字比较疏密变化。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			// #ifdef WEB
			{ value: 'normal', className: '[letter-spacing:normal]', note: '' },
			// #endif
			{ value: '-1px', className: 'tracking-[-1px]', note: '' },
			{ value: '0px', className: 'tracking-[0px]', note: '' },
			{ value: '2px', className: 'tracking-[2px]', note: '' },
			{ value: '4rpx', className: 'tracking-[4rpx]', note: '' }
		]
	},
	{
		property: 'line-height',
		title: '多行行高',
		kind: 'multiline',
		category: '文字排版',
		description: '至少展示三行文字，观察行与行之间的间距。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'normal', className: '[line-height:normal]', note: '' },
			{ value: '20px', className: 'leading-[20px]', note: '' },
			{ value: '32px', className: 'leading-[32px]', note: '' },
			{ value: '48px', className: 'leading-[48px]', note: '' },
			{ value: '64rpx', className: 'leading-[64rpx]', note: '' }
		]
	},
	{
		property: 'lines',
		title: '最大文本行数',
		kind: 'multiline',
		category: '文字排版',
		description: 'Web 使用 line-clamp 工具类演示对应的多行截断，生成 -webkit-line-clamp 声明。',
		support: '官方列为 App 支持；当前 SDK 原生编译未保留 lines，暂在 Web 演示',
		cases: [
			// #ifdef WEB
			{ value: '1', className: 'line-clamp-1', note: '' },
			{ value: '2', className: 'line-clamp-2', note: '' },
			{ value: '3', className: 'line-clamp-3', note: '' },
			{ value: '4', className: 'line-clamp-4', note: '' }
			// #endif
		]
	},
	{
		property: 'text-align',
		title: '文本水平对齐',
		kind: 'multiline',
		category: '文字排版',
		description: '文字框具有明确宽度，左、中、右对齐的差异可直接观察。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'left', className: 'text-left', note: '' },
			{ value: 'center', className: 'text-center', note: '' },
			{ value: 'right', className: 'text-right', note: '' },
			// #ifdef WEB
			{ value: 'justify', className: 'text-justify', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'direction',
		title: '文本溢出方向',
		kind: 'text-overflow',
		category: '文字排版',
		description: '单行长文本从不同方向溢出，分别观察可见的一端。',
		support: 'Web / App Vapor 5.25+',
		cases: [
			{ value: 'ltr', className: '[direction:ltr]', note: '' },
			{ value: 'rtl', className: '[direction:rtl]', note: '' }
		]
	},
	{
		property: 'white-space',
		title: '空白与换行',
		kind: 'whitespace',
		category: '文字排版',
		description: '文本包含多个空格和换行符，预览区固定宽度。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'normal', className: 'whitespace-normal', note: '' },
			{ value: 'nowrap', className: 'whitespace-nowrap', note: '' },
			// #ifdef WEB
			{ value: 'pre', className: 'whitespace-pre', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'pre-wrap', className: 'whitespace-pre-wrap', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'pre-line', className: 'whitespace-pre-line', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{ value: 'break-spaces', className: 'whitespace-break-spaces', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'word-break',
		title: '长单词断行',
		kind: 'word-break',
		category: '文字排版',
		description: '使用超长英文单词；App 的 normal 会自动换行，与 Web 默认行为不同。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: 'normal', className: '[word-break:normal]', note: '' },
			{ value: 'break-all', className: 'break-all', note: '' }
		]
	},
	{
		property: 'text-overflow',
		title: '单行截断',
		kind: 'text-overflow',
		category: '文字排版',
		description: '同时设置固定宽度、overflow-hidden 和 whitespace-nowrap。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'clip', className: 'text-clip', note: '' },
			{ value: 'ellipsis', className: 'text-ellipsis', note: '' }
		]
	},
	{
		property: 'text-shadow',
		title: '文字阴影',
		kind: 'text',
		category: '文字排版',
		description: '阴影应用到文字本身，分别观察偏移、模糊与无阴影。',
		support: 'Web / App 4.61+',
		cases: [
			{ value: '2px 2px 0 #94a3b8', className: '[text-shadow:2px_2px_0_#94a3b8]', note: '' },
			{
				value: '0 2px 6px rgba(37,99,235,0.5)',
				className: '[text-shadow:0_2px_6px_rgba(37,99,235,0.5)]',
				note: ''
			},
			{ value: 'none', className: '[text-shadow:none]', note: '' }
		]
	},
	{
		property: 'text-decoration-line',
		title: '文本装饰线',
		kind: 'text',
		category: '文字排版',
		description: '装饰线直接设置在 text 上。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'underline', className: 'underline', note: '' },
			{ value: 'line-through', className: 'line-through', note: '' },
			{ value: 'none', className: 'no-underline', note: '' },
			// #ifdef WEB
			{ value: 'overline', className: 'overline', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'text-decoration-color',
		title: '装饰线颜色',
		kind: 'decoration',
		category: '文字排版',
		description: '先设置 underline，再改变装饰线颜色。',
		support: 'Web；官方 iOS/HarmonyOS 支持范围在当前 SDK 中未通过编译',
		cases: [
			// #ifdef WEB
			{ value: '#2563eb', className: 'decoration-[#2563eb]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '#0d9488', className: 'decoration-[#0d9488]', note: '' },
			// #endif
			// #ifdef WEB
			{
				value: 'rgba(234,88,12,0.6)',
				className: 'decoration-[rgba(234,88,12,0.6)]',
				note: ''
			}
			// #endif
		]
	},
	{
		property: 'text-decoration-style',
		title: '装饰线样式',
		kind: 'decoration',
		category: '文字排版',
		description: '下划线展示实线、双线、虚线、点线和波浪线。',
		support: '仅 Web',
		cases: [
			// #ifdef WEB
			{ value: 'solid', className: 'decoration-solid', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'double', className: 'decoration-double', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'dashed', className: 'decoration-dashed', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'dotted', className: 'decoration-dotted', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'wavy', className: 'decoration-wavy', note: '' }
			// #endif
		]
	},
	{
		property: 'text-decoration-thickness',
		title: '装饰线粗细',
		kind: 'decoration',
		category: '文字排版',
		description: '固定下划线，比较自动粗细和具体长度。',
		support: '仅 Web',
		cases: [
			// #ifdef WEB
			{ value: 'auto', className: 'decoration-auto', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'from-font', className: 'decoration-from-font', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '1px', className: 'decoration-1', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '4px', className: 'decoration-4', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '8px', className: 'decoration-[8px]', note: '' }
			// #endif
		]
	},
	{
		property: 'text-decoration',
		title: '文本装饰简写',
		kind: 'text',
		category: '文字排版',
		description: '用任意属性组合装饰线、样式、颜色和粗细。',
		support: '仅 Web',
		cases: [
			// #ifdef WEB
			{
				value: 'underline solid #2563eb',
				className: '[text-decoration:underline_solid_#2563eb]',
				note: ''
			},
			// #endif
			// #ifdef WEB
			{
				value: 'line-through dashed #0d9488',
				className: '[text-decoration:line-through_dashed_#0d9488]',
				note: ''
			},
			// #endif
			// #ifdef WEB
			{
				value: 'overline dotted #2563eb',
				className: '[text-decoration:overline_dotted_#2563eb]',
				note: ''
			},
			// #endif
			// #ifdef WEB
			{
				value: 'underline wavy #2563eb 2px',
				className: '[text-decoration:underline_wavy_#2563eb_2px]',
				note: ''
			},
			// #endif
			// #ifdef WEB
			{ value: 'none', className: '[text-decoration:none]', note: '' }
			// #endif
		]
	},
	{
		property: 'transform',
		title: '旋转、缩放与位移',
		kind: 'transform',
		category: '变换与动效',
		description:
			'虚线框是原始位置。Tailwind v4 的 rotate/scale/translate 工具类生成独立 CSS 属性，原生端改用 [transform:...]。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'rotate(20deg)', className: '[transform:rotate(20deg)]', note: '' },
			{ value: 'rotateX(35deg)', className: '[transform:rotateX(35deg)]', note: '' },
			{ value: 'rotateY(35deg)', className: '[transform:rotateY(35deg)]', note: '' },
			{ value: 'rotateZ(20deg)', className: '[transform:rotateZ(20deg)]', note: '' },
			{ value: 'scale(1.25)', className: '[transform:scale(1.25)]', note: '' },
			{ value: 'scaleX(1.4)', className: '[transform:scaleX(1.4)]', note: '' },
			{ value: 'scaleY(0.7)', className: '[transform:scaleY(0.7)]', note: '' },
			{
				value: 'translate(24px,12px)',
				className: '[transform:translate(24px,12px)]',
				note: ''
			},
			{ value: 'translateX(32px)', className: '[transform:translateX(32px)]', note: '' },
			{ value: 'translateY(24px)', className: '[transform:translateY(24px)]', note: '' },
			{ value: 'translateX(25%)', className: '[transform:translateX(25%)]', note: '' },
			{ value: 'translateX(-20px)', className: '[transform:translateX(-20px)]', note: '' },
			{
				value: 'rotate(15deg) scale(0.85)',
				className: '[transform:rotate(15deg)_scale(0.85)]',
				note: ''
			}
		]
	},
	{
		property: 'transform-origin',
		title: '变换原点',
		kind: 'origin',
		category: '变换与动效',
		description: '每个方块都旋转 25deg，改变原点以观察旋转中心。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'center', className: 'origin-center', note: '' },
			{ value: 'top', className: 'origin-top', note: '' },
			{ value: 'right', className: 'origin-right', note: '' },
			{ value: 'bottom', className: 'origin-bottom', note: '' },
			{ value: 'left', className: 'origin-left', note: '' },
			{ value: 'left top', className: 'origin-top-left', note: '' },
			{ value: 'right top', className: 'origin-top-right', note: '' },
			{ value: 'left bottom', className: 'origin-bottom-left', note: '' },
			{ value: 'right bottom', className: 'origin-bottom-right', note: '' },
			{ value: '25% 75%', className: 'origin-[25%_75%]', note: '' }
		]
	},
	{
		property: 'transition',
		title: '过渡简写',
		kind: 'transition',
		category: '变换与动效',
		description: '点击切换按钮，观察预览对象的变化。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'all 600ms ease', className: '[transition:all_600ms_ease]', note: '' },
			{
				value: 'transform 1s linear',
				className: '[transition:transform_1s_linear]',
				note: ''
			},
			{
				value: 'background-color 800ms ease-in-out',
				className: '[transition:background-color_800ms_ease-in-out]',
				note: ''
			},
			{ value: 'none', className: '[transition:none]', note: '' }
		]
	},
	{
		property: 'transition-duration',
		title: '过渡时长',
		kind: 'transition',
		category: '变换与动效',
		description: '点击同一个按钮触发过渡，比较变化所需时间。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0ms', className: 'duration-0', note: '' },
			{ value: '150ms', className: 'duration-150', note: '' },
			{ value: '700ms', className: 'duration-700', note: '' },
			{ value: '1.5s', className: 'duration-[1.5s]', note: '' }
		]
	},
	{
		property: 'transition-delay',
		title: '过渡延迟',
		kind: 'transition',
		category: '变换与动效',
		description: '点击后先等待延迟，再开始相同的过渡。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: '0ms', className: 'delay-0', note: '' },
			{ value: '300ms', className: 'delay-300', note: '' },
			{ value: '1s', className: 'delay-[1s]', note: '' },
			{ value: '-200ms', className: 'delay-[-200ms]', note: '' }
		]
	},
	{
		property: 'transition-property',
		title: '指定过渡属性',
		kind: 'transition',
		category: '变换与动效',
		description:
			'点击切换时同步改变尺寸、边距、颜色、边框、透明度与变换；只有指定属性会平滑过渡。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'all', className: 'transition-all', note: '' },
			{ value: 'none', className: 'transition-none', note: '' },
			{ value: 'width', className: 'transition-[width]', note: '' },
			{ value: 'height', className: 'transition-[height]', note: '' },
			{ value: 'margin', className: 'transition-[margin]', note: '' },
			{ value: 'margin-top', className: 'transition-[margin-top]', note: '' },
			{ value: 'margin-bottom', className: 'transition-[margin-bottom]', note: '' },
			{ value: 'margin-left', className: 'transition-[margin-left]', note: '' },
			{ value: 'margin-right', className: 'transition-[margin-right]', note: '' },
			{ value: 'left', className: 'transition-[left]', note: '' },
			{ value: 'right', className: 'transition-[right]', note: '' },
			{ value: 'top', className: 'transition-[top]', note: '' },
			{ value: 'bottom', className: 'transition-[bottom]', note: '' },
			{ value: 'padding', className: 'transition-[padding]', note: '' },
			{ value: 'padding-left', className: 'transition-[padding-left]', note: '' },
			{ value: 'padding-right', className: 'transition-[padding-right]', note: '' },
			{ value: 'padding-top', className: 'transition-[padding-top]', note: '' },
			{ value: 'padding-bottom', className: 'transition-[padding-bottom]', note: '' },
			{ value: 'opacity', className: 'transition-[opacity]', note: '' },
			{ value: 'background-color', className: 'transition-[background-color]', note: '' },
			{ value: 'border-color', className: 'transition-[border-color]', note: '' },
			{ value: 'border-top-color', className: 'transition-[border-top-color]', note: '' },
			{
				value: 'border-bottom-color',
				className: 'transition-[border-bottom-color]',
				note: ''
			},
			{ value: 'border-left-color', className: 'transition-[border-left-color]', note: '' },
			{ value: 'border-right-color', className: 'transition-[border-right-color]', note: '' },
			{ value: 'transform', className: 'transition-[transform]', note: '' }
		]
	},
	{
		property: 'transition-timing-function',
		title: '过渡速度曲线',
		kind: 'transition',
		category: '变换与动效',
		description: '点击后观察同样时长的运动如何加速和减速。',
		support: 'Web / Android / iOS / HarmonyOS',
		cases: [
			{ value: 'ease', className: 'ease-[ease]', note: '' },
			{ value: 'linear', className: 'ease-linear', note: '' },
			{ value: 'ease-in', className: 'ease-in', note: '' },
			{ value: 'ease-out', className: 'ease-out', note: '' },
			{ value: 'ease-in-out', className: 'ease-in-out', note: '' },
			{
				value: 'cubic-bezier(0.2,0.8,0.2,1)',
				className: 'ease-[cubic-bezier(0.2,0.8,0.2,1)]',
				note: ''
			}
		]
	},
	{
		property: 'animation',
		title: '内置与自定义动画',
		kind: 'animation',
		category: '变换与动效',
		description:
			'点击开始或暂停，观察旋转、扩散、脉冲、跳动与水平移动。App 需要 Vapor 5.31+，不设置 flatten。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: 'spin 1s linear infinite', className: 'animate-spin', note: '' },
			{
				value: 'ping 1s cubic-bezier(0,0,0.2,1) infinite',
				className: 'animate-ping',
				note: ''
			},
			{
				value: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
				className: 'animate-pulse',
				note: ''
			},
			{ value: 'bounce 1s infinite', className: 'animate-bounce', note: '' },
			{
				value: 'demo-travel 2s ease-in-out infinite alternate',
				className: 'animate-[demo-travel_2s_ease-in-out_infinite_alternate]',
				note: ''
			},
			{ value: 'none', className: 'animate-none', note: '' }
		]
	},
	{
		property: 'animation-name',
		title: '动画名称',
		kind: 'animation',
		category: '变换与动效',
		description: 'demo-travel 与 demo-turn 是示例内定义的关键帧。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: 'demo-travel', className: '[animation-name:demo-travel]', note: '' },
			{ value: 'demo-turn', className: '[animation-name:demo-turn]', note: '' },
			{ value: 'none', className: '[animation-name:none]', note: '' }
		]
	},
	{
		property: 'animation-duration',
		title: '动画时长',
		kind: 'animation',
		category: '变换与动效',
		description: '同一个移动动画使用不同周期；auto 仅在 Web 展示。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: '0s', className: '[animation-duration:0s]', note: '' },
			{ value: '600ms', className: '[animation-duration:600ms]', note: '' },
			{ value: '2s', className: '[animation-duration:2s]', note: '' },
			{ value: '4s', className: '[animation-duration:4s]', note: '' },
			// #ifdef WEB
			{ value: 'auto', className: '[animation-duration:auto]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'animation-delay',
		title: '动画延迟',
		kind: 'animation',
		category: '变换与动效',
		description: '点击重新播放后观察等待时间；负延迟从动画中段开始。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: '0s', className: '[animation-delay:0s]', note: '' },
			{ value: '600ms', className: '[animation-delay:600ms]', note: '' },
			{ value: '2s', className: '[animation-delay:2s]', note: '' },
			{ value: '-1s', className: '[animation-delay:-1s]', note: '' }
		]
	},
	{
		property: 'animation-direction',
		title: '动画播放方向',
		kind: 'animation',
		category: '变换与动效',
		description: '左端与右端标记移动范围，观察往返与反向。',
		support: 'Web / App Vapor 5.31+；反向值仅 Web 演示',
		cases: [
			{ value: 'normal', className: '[animation-direction:normal]', note: '' },
			{ value: 'alternate', className: '[animation-direction:alternate]', note: '' },
			// #ifdef WEB
			{ value: 'reverse', className: '[animation-direction:reverse]', note: '仅 Web 演示' },
			// #endif
			// #ifdef WEB
			{
				value: 'alternate-reverse',
				className: '[animation-direction:alternate-reverse]',
				note: '仅 Web 演示'
			}
			// #endif
		]
	},
	{
		property: 'animation-fill-mode',
		title: '动画结束后的样式',
		kind: 'animation',
		category: '变换与动效',
		description: '只运行一次并设置延迟，观察执行前后停留的位置。',
		support: 'Web / App Vapor 5.31+；部分值仅 Web 演示',
		cases: [
			// #ifdef WEB
			{ value: 'none', className: '[animation-fill-mode:none]', note: '仅 Web 演示' },
			// #endif
			{ value: 'forwards', className: '[animation-fill-mode:forwards]', note: '' },
			// #ifdef WEB
			{
				value: 'backwards',
				className: '[animation-fill-mode:backwards]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{ value: 'both', className: '[animation-fill-mode:both]', note: '仅 Web 演示' }
			// #endif
		]
	},
	{
		property: 'animation-iteration-count',
		title: '动画播放次数',
		kind: 'animation',
		category: '变换与动效',
		description: '点击重新播放，以比较有限次数和无限循环。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: '1', className: '[animation-iteration-count:1]', note: '' },
			{ value: '2', className: '[animation-iteration-count:2]', note: '' },
			{ value: '3', className: '[animation-iteration-count:3]', note: '' },
			{ value: '1.5', className: '[animation-iteration-count:1.5]', note: '' },
			{ value: 'infinite', className: '[animation-iteration-count:infinite]', note: '' }
		]
	},
	{
		property: 'animation-play-state',
		title: '动画运行与暂停',
		kind: 'animation',
		category: '变换与动效',
		description: 'running 播放，paused 停留；重新播放按钮会重建预览元素。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: 'running', className: '[animation-play-state:running]', note: '' },
			{ value: 'paused', className: '[animation-play-state:paused]', note: '' }
		]
	},
	{
		property: 'animation-timing-function',
		title: '动画速度曲线',
		kind: 'animation',
		category: '变换与动效',
		description: '同一条移动路径使用不同速度曲线；steps 相关值仅在 Web 演示。',
		support: 'Web / App Vapor 5.31+',
		cases: [
			{ value: 'ease', className: '[animation-timing-function:ease]', note: '' },
			{ value: 'linear', className: '[animation-timing-function:linear]', note: '' },
			{ value: 'ease-in', className: '[animation-timing-function:ease-in]', note: '' },
			{ value: 'ease-out', className: '[animation-timing-function:ease-out]', note: '' },
			{
				value: 'ease-in-out',
				className: '[animation-timing-function:ease-in-out]',
				note: ''
			},
			{
				value: 'cubic-bezier(0.2,0.8,0.2,1)',
				className: '[animation-timing-function:cubic-bezier(0.2,0.8,0.2,1)]',
				note: ''
			},
			// #ifdef WEB
			{
				value: 'steps(4,jump-start)',
				className: '[animation-timing-function:steps(4,jump-start)]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'steps(4,jump-end)',
				className: '[animation-timing-function:steps(4,jump-end)]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'steps(4,jump-none)',
				className: '[animation-timing-function:steps(4,jump-none)]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'steps(4,jump-both)',
				className: '[animation-timing-function:steps(4,jump-both)]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'step-start',
				className: '[animation-timing-function:step-start]',
				note: '仅 Web 演示'
			},
			// #endif
			// #ifdef WEB
			{
				value: 'step-end',
				className: '[animation-timing-function:step-end]',
				note: '仅 Web 演示'
			}
			// #endif
		]
	},
	{
		property: 'animation-composition',
		title: '动画合成方式',
		kind: 'composition',
		category: 'Web 扩展',
		description: '对象已有 translateX(20px)，观察动画是替换、相加还是累积。',
		support: '仅 Web；取决于浏览器支持',
		cases: [
			// #ifdef WEB
			{ value: 'replace', className: '[animation-composition:replace]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'add', className: '[animation-composition:add]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'accumulate', className: '[animation-composition:accumulate]', note: '' }
			// #endif
		]
	},
	{
		property: 'animation-timeline',
		title: '滚动驱动时间轴',
		kind: 'timeline',
		category: 'Web 扩展',
		description: '滚动每张卡片内的独立预览区。scroll() 依赖滚动进度，view() 依赖元素进入视口。',
		support: '仅 Web；取决于浏览器支持',
		cases: [
			// #ifdef WEB
			{ value: 'auto', className: '[animation-timeline:auto]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'none', className: '[animation-timeline:none]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'scroll()', className: '[animation-timeline:scroll()]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'view()', className: '[animation-timeline:view()]', note: '' }
			// #endif
		]
	},
	{
		property: 'animation-range',
		title: '滚动动画生效区间',
		kind: 'timeline',
		category: 'Web 扩展',
		description: '使用 view() 时间轴，滚动预览区观察指定阶段。',
		support: '仅 Web；取决于浏览器支持',
		cases: [
			// #ifdef WEB
			{ value: 'normal', className: '[animation-range:normal]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'cover', className: '[animation-range:cover]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'contain', className: '[animation-range:contain]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'entry', className: '[animation-range:entry]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'exit', className: '[animation-range:exit]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'entry-crossing', className: '[animation-range:entry-crossing]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'exit-crossing', className: '[animation-range:exit-crossing]', note: '' },
			// #endif
			// #ifdef WEB
			{
				value: 'entry 20% exit 80%',
				className: '[animation-range:entry_20%_exit_80%]',
				note: ''
			}
			// #endif
		]
	},
	{
		property: 'animation-range-start',
		title: '滚动动画开始边界',
		kind: 'timeline',
		category: 'Web 扩展',
		description: '使用 view() 时间轴，滚动预览区观察边界对动画进度的影响。',
		support: '仅 Web；取决于浏览器支持',
		cases: [
			// #ifdef WEB
			{ value: 'normal', className: '[animation-range-start:normal]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '20%', className: '[animation-range-start:20%]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'entry 20%', className: '[animation-range-start:entry_20%]', note: '' }
			// #endif
		]
	},
	{
		property: 'animation-range-end',
		title: '滚动动画结束边界',
		kind: 'timeline',
		category: 'Web 扩展',
		description: '使用 view() 时间轴，滚动预览区观察边界对动画进度的影响。',
		support: '仅 Web；取决于浏览器支持',
		cases: [
			// #ifdef WEB
			{ value: 'normal', className: '[animation-range-end:normal]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: '80%', className: '[animation-range-end:80%]', note: '' },
			// #endif
			// #ifdef WEB
			{ value: 'exit 80%', className: '[animation-range-end:exit_80%]', note: '' }
			// #endif
		]
	}
]
