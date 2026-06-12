import type { PermissionKind, PermissionRequest } from "./types";

const pendingApprovals: PermissionRequest[] = [];
const grantedCache = new Map<string, PermissionRequest[]>();

let reqCounter = 0;

export function requestPermission(pluginId: string, kind: PermissionKind, description: string, autoGrant = false): PermissionRequest {
  const req: PermissionRequest = {
    id: `perm-${Date.now()}-${++reqCounter}`,
    pluginId,
    kind,
    description,
    granted: autoGrant,
    requestedAt: Date.now(),
  };
  if (autoGrant) {
    req.grantedAt = Date.now();
    const existing = grantedCache.get(pluginId) || [];
    existing.push(req);
    grantedCache.set(pluginId, existing);
  } else {
    pendingApprovals.push(req);
  }
  return req;
}

export function approvePermission(requestId: string): boolean {
  const idx = pendingApprovals.findIndex((r) => r.id === requestId);
  if (idx < 0) return false;
  const req = pendingApprovals.splice(idx, 1)[0];
  req.granted = true;
  req.grantedAt = Date.now();
  const existing = grantedCache.get(req.pluginId) || [];
  existing.push(req);
  grantedCache.set(req.pluginId, existing);
  return true;
}

export function denyPermission(requestId: string): boolean {
  const idx = pendingApprovals.findIndex((r) => r.id === requestId);
  if (idx < 0) return false;
  pendingApprovals.splice(idx, 1)[0];
  return true;
}

export function checkPermission(pluginId: string, kind: PermissionKind): boolean {
  const grants = grantedCache.get(pluginId);
  if (!grants) return false;
  return grants.some((g) => g.kind === kind && g.granted);
}

export function listPendingApprovals(): PermissionRequest[] {
  return [...pendingApprovals];
}

export function listGrantedPermissions(pluginId?: string): PermissionRequest[] {
  if (pluginId) return grantedCache.get(pluginId) || [];
  return Array.from(grantedCache.values()).flat();
}