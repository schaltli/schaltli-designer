const mqtt = require("mqtt")
const client = mqtt.connect("mqtt://localhost:1883")
client.on("connect", () => {
  console.log("connected, subscribing to screenbee/+/debug")
  client.subscribe("screenbee/+/debug")
})
client.on("message", (topic, payload) => {
  console.log(new Date().toISOString(), topic, payload.toString())
})
