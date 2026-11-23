/**
 * 应用元信息（版本号 / 仓库地址）唯一出口。
 *
 * 版本号由 vite.config.ts 在构建时从 package.json 注入（`__APP_VERSION__`），
 * 前端任何地方要显示版本都读这里，避免「关于页写 1.0、更新检测按 1.0.0 比」这类漂移。
 */
export const APP_VERSION: string = __APP_VERSION__;

/** 应用展示名 */
export const APP_NAME = 'ChesStars';

/** GitHub 仓库（owner/repo） */
export const GITHUB_OWNER = 'Dhik0';
export const GITHUB_REPO_NAME = 'ChesStars';
export const GITHUB_REPO = `${GITHUB_OWNER}/${GITHUB_REPO_NAME}`;

/** 仓库主页：设置页的「开源仓库」入口 */
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

/** 仓库根目录的版本清单（不走 GitHub API，避免 60 次/小时限流） */
export const VERSION_MANIFEST_PATH = 'version.json';

/** 最新 Release 接口（未认证调用，60 次/小时/IP） */
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Release 列表页：接口拿不到 html_url 时的兜底跳转地址 */
export const GITHUB_RELEASES_PAGE = `${GITHUB_REPO_URL}/releases/latest`;
