import type { NextConfig } from "next";

// يُبنى التطبيق كموقع ثابت بالكامل (client-only، بدون سيرفر) عند التوزيع على GitHub Pages
// أو Cloudflare Pages. على GitHub Pages يُخدَّم من مسار فرعي باسم الريبو بدلاً من الجذر،
// أما على Cloudflare Pages (تُعرَّف CF_PAGES تلقائيًا أثناء البناء) فيُخدَّم من الجذر مباشرة.
const isGithubPages = process.env.GITHUB_PAGES === "true";
const isCloudflarePages = process.env.CF_PAGES === "1";
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
    : isCloudflarePages
      ? {
          output: "export",
          images: { unoptimized: true },
          trailingSlash: true,
        }
      : {}),
};

export default nextConfig;
