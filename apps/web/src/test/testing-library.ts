import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

// Loaded after happy-dom: Testing Library binds to the document when it is imported.
afterEach(() => {
  cleanup();
});
