import { EventEmitter } from "events";

// Single shared bus: pollers emit "new-item", server.js listens and forwards to SSE clients.
const bus = new EventEmitter();
bus.setMaxListeners(50);

export default bus;
