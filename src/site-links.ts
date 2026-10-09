export type SiteConfig = { videoUrl?: string; downloadUrl?: string; repositoryUrl?: string };

export function siteLinks(config: SiteConfig): [string, string][] {
  return ([[config.videoUrl, '사용 영상 보기'], [config.downloadUrl, '프로그램 내려받기(zip)'], [config.repositoryUrl, 'GitHub에서 보기·포크']] as [string | undefined, string][])
    .filter((link): link is [string, string] => !!link[0] && link[0] !== 'TODO-URL' && /^(https:\/\/|\.\/)/.test(link[0]));
}
