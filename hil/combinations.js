// Wrap-around MQTT-value combination generation, shared by both
// orchestrators (hil/epaper, hil/android) - for each screen, run as many
// combinations as the MAX number of examples across the topics that
// screen's objects (including nested tab-control panel children) bind to.
// Combination i uses examples[i % examples.length] per topic. A screen with
// no MQTT-bound objects just gets 1 combination.

// Recurses into obj.children (tab-control -> panel -> arbitrary depth) - a
// topic used only by a nested object (e.g. a level-indicator inside a
// tab-control's panel) used to be invisible to this function entirely,
// since it only scanned top-level screen.objects. That silently excluded
// such topics from combination generation, so they were never published
// via MQTT during a run at all (2026-07-25 finding, first tab-control HIL
// run on the e-paper target).
function screenTopics(project, screen) {
  const set = new Set();
  const walk = (objects) => {
    for (const obj of objects) {
      // Both bindings, not just the first. An arc-level carries a second
      // one - setpointTopic, the marker's value - and it was invisible here
      // exactly the way a nested object's topic once was: never published
      // during a run, so the device kept whatever the broker last held while
      // the designer rendered the topic's first example instead. That showed
      // up as a constant 216-pixel difference on every combination of one
      // screen, which reads as a rendering bug rather than as a topic that
      // was never sent (2026-08-23, first arc-level HIL run).
      if (obj.properties && obj.properties.topic) set.add(obj.properties.topic);
      if (obj.properties && obj.properties.setpointTopic) set.add(obj.properties.setpointTopic);
      if (obj.children && obj.children.length > 0) walk(obj.children);
    }
  };
  walk(screen.objects);
  return [...set];
}

function combinationCount(project, screen) {
  const topicsByName = Object.fromEntries((project.topics || []).map((t) => [t.topic, t]));
  const topics = screenTopics(project, screen);
  if (topics.length === 0) return 1;
  return Math.max(...topics.map((t) => (topicsByName[t]?.examples?.length || 1)));
}

function combinationOverrides(project, screen, i) {
  const topicsByName = Object.fromEntries((project.topics || []).map((t) => [t.topic, t]));
  const overrides = {};
  for (const t of screenTopics(project, screen)) {
    const examples = topicsByName[t]?.examples || [];
    if (examples.length > 0) overrides[t] = examples[i % examples.length];
  }
  return overrides;
}

module.exports = { screenTopics, combinationCount, combinationOverrides };
