const RELEASES_API_URL = "https://api.github.com/repos/wduan1212-rgb/Jindou-agent/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/wduan1212-rgb/Jindou-agent/releases/latest";

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  name?: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseUrl: string;
}

export async function checkLatestVersion(currentVersion: string): Promise<UpdateCheckResult> {
  const response = await fetch(RELEASES_API_URL, {
    headers: {
      accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error("暂时无法连接 GitHub Releases。");
  }

  const release = (await response.json()) as GitHubRelease;
  const latestVersion = normalizeVersion(release.tag_name || release.name || "");

  return {
    currentVersion,
    latestVersion: latestVersion || null,
    hasUpdate: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
    releaseUrl: release.html_url || RELEASES_PAGE_URL
  };
}

export function openLatestReleasePage() {
  window.open(RELEASES_PAGE_URL, "_blank", "noopener,noreferrer");
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map(toVersionPart);
  const rightParts = normalizeVersion(right).split(".").map(toVersionPart);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function toVersionPart(value: string): number {
  const parsed = Number(value.replace(/[^\d].*$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
