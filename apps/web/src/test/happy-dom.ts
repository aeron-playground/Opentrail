import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Loaded before any test file, so window and document exist when components import.
GlobalRegistrator.register({ url: "http://localhost:5173/" });
