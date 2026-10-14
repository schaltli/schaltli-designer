import { test, expect } from "@playwright/test"
import { heardMessage, payloadType, KEPT_MESSAGES, type HeardTopic } from "../lib/heard-topic"

// What the designer keeps of one topic it heard (lib/heard-topic.ts,
// docs/2026-10-14-topic-discovery.md decision 2). Pure: no page, no broker.

function hear(topic: string, payloads: (string | [string, boolean])[]): HeardTopic {
  let t: HeardTopic | undefined
  payloads.forEach((p, i) => {
    const [payload, retained] = Array.isArray(p) ? p : [p, false]
    t = heardMessage(topic, t, payload, retained, 1000 + i)
  })
  return t!
}

test.describe("one heard topic", () => {
  test("keeps the latest 20 messages, newest first, and counts them all", () => {
    const t = hear("pkw/tele/battery/current", Array.from({ length: 25 }, (_, i) => String(i)))
    expect(t.count).toBe(25)
    expect(t.messages).toHaveLength(KEPT_MESSAGES)
    expect(t.messages[0]).toEqual({ payload: "24", at: 1024, retained: false })
    expect(t.messages.at(-1)!.payload).toBe("5")
  })

  test("a retained message marks it retained for good", () => {
    expect(hear("a", [["1", true], "2"]).retained).toBe(true)
    expect(hear("a", ["1", "2"]).retained).toBe(false)
  })

  test("the type: a number, then text is text; JSON once seen stays JSON", () => {
    expect(hear("a", ["1", "2.5"]).type).toBe("numeric")
    expect(hear("a", ["1", "closed"]).type).toBe("text")
    expect(hear("a", ["closed", "1"]).type).toBe("text")
    expect(hear("a", ['{"a":1}', "1"]).type).toBe("json")
    expect(payloadType("")).toBe("text")
    expect(payloadType("[1,2]")).toBe("json")
    expect(payloadType('"23"')).toBe("text")
  })

  test("a JSON topic's fields are merged across messages; a message with nothing new is not kept as an example", () => {
    const t = hear("zigbee2mqtt/door", ['{"contact":true}', '{"contact":false}', '{"contact":true,"battery":91}'])
    expect(t.fields.map((f) => f.path)).toEqual(["contact", "battery"])
    expect(t.jsonExamples).toEqual(['{"contact":true}', '{"contact":true,"battery":91}'])
  })
})
