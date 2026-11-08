import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath } from 'node:url'

export default defineConfig(async () => {
	const { uniAppXTailwind } = await import('tao-tailwindx')
	return {
		plugins: [
			uniAppXTailwind({ entry: fileURLToPath(new URL('./tailwind.css', import.meta.url)) }),
			uni()
		]
	}
})
