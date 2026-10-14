import { createContext } from "react"
import type { Topic } from "./project-editor"

// Adding a topic where it is chosen (docs/2026-10-14-topic-discovery.md,
// decisions 4-5): the Topic Picker and the `{topic:…}` completion add a
// heard topic, or one typed by hand, to the project. Through a context, so
// the many property panels that hand `topics` down need no new prop. The
// editor gives the topic and its subtopics their ids; a name the project
// has already is left as it is.

export type NewTopic = Omit<Topic, "id" | "subtopics"> & { subtopics?: { path: string; type: "numeric" | "text" }[] }

export const TopicAdderContext = createContext<((topic: NewTopic) => void) | null>(null)
