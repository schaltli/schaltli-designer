import { test, expect } from "@playwright/test"
import { topicTree, searchTopicTree, sortedChildren, ancestorPaths, type TopicTreeNode } from "../lib/topic-tree"

// The one tree of every topic list (lib/topic-tree.ts,
// docs/2026-10-14-topic-discovery.md decision 3). Pure.

const VAN = [
  { topic: "pkw/tele/battery/current", item: "-4.6", messages: 412 },
  { topic: "pkw/tele/battery/soc", item: "87", messages: 1 },
  { topic: "pkw/tele/water/fresh", item: "64", messages: 1 },
  { topic: "pkw/tele/water/grey", item: "22", messages: 1 },
  { topic: "pkw/tele/doorman", item: "closed", messages: 2 },
  { topic: "zigbee2mqtt/door_sensor", item: '{"contact":true}', messages: 41 },
  { topic: "zigbee2mqtt/door_sensor/availability", item: "online", messages: 1 },
]

const at = <T,>(tree: TopicTreeNode<T>, path: string) => path.split("/").reduce((n, part) => n.children.get(part)!, tree)

test.describe("the topic tree", () => {
  test("each level names itself; a branch counts the topics and messages below it", () => {
    const tree = topicTree(VAN)
    expect(sortedChildren(tree).map((n) => n.name)).toEqual(["pkw", "zigbee2mqtt"])
    expect(at(tree, "pkw")).toMatchObject({ name: "pkw", path: "pkw", topics: 5, messages: 417 })
    expect(at(tree, "pkw/tele/battery")).toMatchObject({ topics: 2, messages: 413 })
    expect(at(tree, "pkw/tele/battery/current")).toMatchObject({ name: "current", item: "-4.6", topics: 1, messages: 412 })
    expect(tree).toMatchObject({ topics: 7, messages: 459 })
  })

  test("a topic that is also a branch keeps its own value and its children", () => {
    const door = at(topicTree(VAN), "zigbee2mqtt/door_sensor")
    expect(door.item).toBe('{"contact":true}')
    expect([...door.children.keys()]).toEqual(["availability"])
    expect(door).toMatchObject({ topics: 2, messages: 42 })
  })

  test("a fragment found at any level: only branches with a match, opened down to it", () => {
    const { tree, open } = searchTopicTree(topicTree(VAN), (path) => path.toLowerCase().includes("water"))
    expect(sortedChildren(tree).map((n) => n.name)).toEqual(["pkw"])
    expect(sortedChildren(at(tree, "pkw/tele")).map((n) => n.name)).toEqual(["water"])
    expect(sortedChildren(at(tree, "pkw/tele/water")).map((n) => n.name)).toEqual(["fresh", "grey"])
    expect([...open].sort()).toEqual(["pkw", "pkw/tele", "pkw/tele/water"])
    expect(at(tree, "pkw")).toMatchObject({ topics: 2, messages: 2 })
  })

  test("a match on a topic that is also a branch keeps it without the children that do not match", () => {
    const { tree } = searchTopicTree(topicTree(VAN), (path) => path.endsWith("door_sensor"))
    const door = at(tree, "zigbee2mqtt/door_sensor")
    expect(door.item).toBe('{"contact":true}')
    expect(door.children.size).toBe(0)
    expect(door).toMatchObject({ topics: 1, messages: 41 })
  })

  test("nothing matched: an empty tree", () => {
    const { tree, open } = searchTopicTree(topicTree(VAN), () => false)
    expect(tree.children.size).toBe(0)
    expect(open.size).toBe(0)
  })

  test("ancestor paths", () => {
    expect(ancestorPaths("a/b/c")).toEqual(["a", "a/b"])
    expect(ancestorPaths("a")).toEqual([])
  })
})
