/**
 * Optional integration with the Zotero Bridge community plugin, which exposes
 * `window.PluginApi.ZoteroBridge.v1()`. Everything is feature-detected so the
 * tracker works normally when Zotero Bridge isn't installed.
 */

interface ZoteroItem {
  getValues(): unknown;
}

export interface ZoteroBridgeApi {
  search(): Promise<ZoteroItem | null | undefined>;
}

interface PluginApiWindow {
  PluginApi?: { ZoteroBridge?: { v1?: () => unknown } };
}

function isZoteroBridgeApi(value: unknown): value is ZoteroBridgeApi {
  return typeof value === "object" && value !== null && typeof (value as { search?: unknown }).search === "function";
}

export function getZoteroBridge(): ZoteroBridgeApi | null {
  try {
    const api = (window as unknown as PluginApiWindow).PluginApi?.ZoteroBridge?.v1?.();
    return isZoteroBridgeApi(api) ? api : null;
  } catch {
    return null;
  }
}

/** Opens the Zotero Bridge search; resolves to the chosen item's raw values, or null. */
export async function pickZoteroItem(api: ZoteroBridgeApi): Promise<unknown> {
  const item = await api.search();
  if (!item || typeof item.getValues !== "function") return null;
  return item.getValues();
}
