/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 題目池是執行時用 fs 讀的 JSON，部署時要一起打包進 API 函式
    outputFileTracingIncludes: { '/api/**/*': ['./data/pool/**/*'] },
  },
}

export default nextConfig
