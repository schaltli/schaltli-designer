// Shared between app/api/deploy/route.ts and app/api/deploy/[instanceId]/
// route.ts - instanceId comes from the MQTT-discovered device list, but
// both routes treat it as untrusted request input (query/route param)
// before using it to build a filesystem path, so it's validated the same
// way in both places rather than trusting the caller.

// Matches the firmware's own clientId_ format ("EPaper-" + hex MAC,
// MqttClient.cpp) - alphanumeric, underscore, hyphen only. Rejects
// anything else, in particular "/" and "..", so instanceId can never be
// used for path traversal when building a filesystem path from it.
const VALID_INSTANCE_ID = /^[A-Za-z0-9_-]+$/

export function isValidInstanceId(instanceId: string): boolean {
  return VALID_INSTANCE_ID.test(instanceId)
}
