import type { NextConfig } from "next";

// يُبنى التطبيق كموقع ثابت بالكامل (client-only، بدون سيرفر) عند التوزيع على GitHub Pages،
// حيث يُخدَّم من مسار فرعي باسم الريبو بدلاً من الجذر.
const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = "athar-accounts";

const nextConfig: NextConfig = {
  ...(isGithubPages
    ? {
        output: "export",
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
