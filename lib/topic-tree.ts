// The one tree of every topic list (docs/2026-10-14-topic-discovery.md,
// decision 3): a topic's name split at "/", each node naming its own level
// only - so nothing is cut off where topics differ, at the end - and each
// branch counting the topics and messages below it. The Topic Picker and
// «Listen to Broker» both draw it. Pure.

export interface TopicTreeNode<T> {
  /** This level's own name. */
  name: string
  /** The path down to here, "a/b/c". */
  path: string
  /** The topic of exactly this path, when there is one - a topic can be a branch too. */
  item?: T
  children: Map<string, TopicTreeNode<T>>
  /** Topics at or below this node. */
  topics: number
  /** Messages at or below this node, as the items count them. */
  messages: number
}

export interface TopicTreeItem<T> {
  topic: string
  item: T
  /** Messages heard on it, for the branch counts; 0 where nobody counts. */
  messages?: number
}

function node<T>(name: string, path: string): TopicTreeNode<T> {
  return { name, path, children: new Map(), topics: 0, messages: 0 }
}

/** The tree of `items`; its root has the empty name and path. */
export function topicTree<T>(items: readonly TopicTreeItem<T>[]): TopicTreeNode<T> {
  const root = node<T>("", "")
  for (const { topic, item, messages = 0 } of items) {
    const parts = topic.split("/")
    let at = root
    at.topics++
    at.messages += messages
    parts.forEach((part, i) => {
      let next = at.children.get(part)
      if (!next) {
        next = node<T>(part, parts.slice(0, i + 1).join("/"))
        at.children.set(part, next)
      }
      at = next
      at.topics++
      at.messages += messages
    })
    at.item = item
  }
  return root
}

/** A node's children in the order a list shows them: by name, ignoring case. */
export function sortedChildren<T>(n: TopicTreeNode<T>): TopicTreeNode<T>[] {
  return [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

/**
 * The tree cut down to the topics `match` accepts, with the paths to open so
 * that each match shows: every ancestor of a match. Counts are of what is
 * left. A fragment search is `(path) => path.toLowerCase().includes(q)` -
 * it finds «water» in `pkw/tele/water/fresh` at any level.
 */
export function searchTopicTree<T>(
  tree: TopicTreeNode<T>,
  match: (path: string, item: T) => boolean,
): { tree: TopicTreeNode<T>; open: Set<string> } {
  const open = new Set<string>()
  const prune = (n: TopicTreeNode<T>): TopicTreeNode<T> | null => {
    const out = node<T>(n.name, n.path)
    const own = n.item !== undefined && match(n.path, n.item)
    if (own) {
      out.item = n.item
      out.topics = 1
    }
    let ownMessages = n.messages
    for (const child of n.children.values()) {
      ownMessages -= child.messages
      const kept = prune(child)
      if (!kept) continue
      out.children.set(child.name, kept)
      out.topics += kept.topics
      out.messages += kept.messages
    }
    if (own) out.messages += ownMessages
    if (!own && out.children.size === 0) return null
    if (out.children.size > 0 && n.path) open.add(n.path)
    return out
  }
  return { tree: prune(tree) ?? node<T>("", ""), open }
}

/** Every ancestor path of a topic, not the topic: "a/b/c" -> ["a", "a/b"]. */
export function ancestorPaths(topic: string): string[] {
  const parts = topic.split("/")
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))
}
