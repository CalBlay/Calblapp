// next.config.ts
import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'
import webpack from 'webpack'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})

const nextConfig: NextConfig = {
  eslint: {
    // 🚀 Ignora errors d’ESLint durant el build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 🚀 Permet continuar el build encara que hi hagi errors de tipus
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'cal-blay-webapp.firebasestorage.app',
      },
    ],
  },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve('buffer'),
    }
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      })
    )
    return config
  },
}

export default withBundleAnalyzer(nextConfig)
