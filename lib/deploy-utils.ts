// Shared between app/api/deploy/route.ts and app/api/deploy/[instanceId]/
// route.ts - instanceId comes from the MQTT-discovered device list, but
// both routes treat it as untrusted request input (query/route param)
// before using it to build a filesystem path, so it's validated the same
// way in both places rather than trusting the caller.

// Matches the firmware's own clientId_ format ("EPaper-" + hex MAC,
// MqttClient.cpp) - alphanumeric, underscore, hyphen only. Rejects
// anything else, in particular "/" and "..", so instanceId can never be
// used for path traversal when building a filesystem path from it.
// Also reused for projectId (see app/api/projects/*) - generateUuid()'s
// output (hex + hyphens) fits the exact same "safe path segment" shape,
// no need for a second regex.
const VALID_PATH_SEGMENT_ID = /^[A-Za-z0-9_-]+$/

export function isValidInstanceId(instanceId: string): boolean {
  return VALID_PATH_SEGMENT_ID.test(instanceId)
}

export function isValidProjectId(projectId: string): boolean {
  return VALID_PATH_SEGMENT_ID.test(projectId)
}

// deviceId comes from a device's own MQTT `hello` (untrusted, like
// instanceId), used to build a filesystem path under .data/ddf/ - see
// app/api/ddf/fetch/route.ts.
export function isValidDeviceId(deviceId: string): boolean {
  return VALID_PATH_SEGMENT_ID.test(deviceId)
}
