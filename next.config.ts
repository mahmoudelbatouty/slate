import type { NextConfig } from "next";

// No `images.remotePatterns`: every provider mark is bundled under
// `public/brands`, so a page render reaches no external host. Restoring a
// remote pattern would also re-open the third-party request this removed.
const nextConfig: NextConfig = {};

export default nextConfig;
