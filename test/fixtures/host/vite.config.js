import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { uniAppXTailwind } from 'tao-tailwindx'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./tailwind.css', import.meta.url))

export default defineConfig({
	plugins: [uniAppXTailwind({ entry }), uni.default()]
})
