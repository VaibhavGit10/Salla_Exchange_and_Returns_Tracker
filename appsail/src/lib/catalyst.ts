// appsail/src/lib/catalyst.ts
// Request-scoped Catalyst app init (required for AppSail — do NOT cache a singleton).
import catalyst from "zcatalyst-sdk-node";

export function getCatalystApp(req: any) {
  return catalyst.initialize(req);
}

export function datastore(req: any) {
  return getCatalystApp(req).datastore();
}

export function table(req: any, name: string) {
  return getCatalystApp(req).datastore().table(name);
}
