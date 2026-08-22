/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Was `ignoreBuildErrors: true` until 2026-08-22, which meant the type
    // checker gated nothing: 28 errors had accumulated and the build passed
    // regardless. They are fixed and the count is zero, so the gate is
    // worth having - the point is not those 28 but the 29th, which would
    // otherwise arrive invisibly in the same noise.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
