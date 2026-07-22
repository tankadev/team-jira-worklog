/**
 * The bot message template — pure, no `server-only`, so the config UI can show
 * the same default the server falls back to. Placeholders are substituted
 * literally; the default matches the original notifyBot output.
 */
export const DEFAULT_MESSAGE_TEMPLATE = `Hi mọi người, em có update app iOS:
**{app}** ({version}): build _{build}_

{content}`

export function renderMessage(
  template: string,
  input: { appName: string; version: string; buildNumber: string; whatsNew: string },
): string {
  return (template.trim() || DEFAULT_MESSAGE_TEMPLATE)
    .replaceAll('{app}', input.appName)
    .replaceAll('{version}', input.version)
    .replaceAll('{build}', input.buildNumber)
    .replaceAll('{content}', input.whatsNew.trim())
}
