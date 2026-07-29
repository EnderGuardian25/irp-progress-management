import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts sets `test.globals: false`, so React Testing Library's
// automatic cleanup (which detects a global `afterEach`) never registers.
// Without this, each render() in a test file accumulates in the jsdom
// document instead of unmounting after its test, so a later test's
// document-wide query (getByLabelText, etc.) can match a previous test's
// leftover DOM.
afterEach(cleanup);
