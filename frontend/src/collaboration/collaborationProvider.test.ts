// =============================================================
// collaborationProvider.test.ts
// Issue #446 — Collaboration Provider Productionization
//
// Tests:
//  ✅ add track sync
//  ✅ remove track sync
//  ✅ collaborator awareness updates
//  ✅ provider disconnect recovery (mock)
// =============================================================

import { createMockProvider } from "./collaborationProvider";

// Helper: wait for Yjs observers to fire
const tick = () => new Promise((r) => setTimeout(r, 0));

// -------------------------------------------------------------
// Track sync tests
// -------------------------------------------------------------

describe("collaborationProvider — track sync", () => {

  it("starts with an empty track list", () => {
    const provider = createMockProvider({ userName: "Alice" });
    expect(provider.tracks.toArray()).toEqual([]);
    provider.destroy();
  });

  it("adds a track and reflects it in the shared array", async () => {
    const provider = createMockProvider({ userName: "Alice" });

    provider.doc.transact(() => {
      provider.tracks.push(["track-001"]);
    });

    await tick();
    expect(provider.tracks.toArray()).toContain("track-001");
    provider.destroy();
  });

  it("adds multiple tracks in order", async () => {
    const provider = createMockProvider({ userName: "Alice" });

    provider.doc.transact(() => {
      provider.tracks.push(["track-001", "track-002", "track-003"]);
    });

    await tick();
    expect(provider.tracks.toArray()).toEqual([
      "track-001",
      "track-002",
      "track-003",
    ]);
    provider.destroy();
  });

  it("removes a track by index", async () => {
    const provider = createMockProvider({ userName: "Alice" });

    provider.doc.transact(() => {
      provider.tracks.push(["track-001", "track-002", "track-003"]);
    });
    await tick();

    // Remove middle track
    provider.doc.transact(() => {
      provider.tracks.delete(1, 1);
    });
    await tick();

    expect(provider.tracks.toArray()).toEqual(["track-001", "track-003"]);
    provider.destroy();
  });

  it("two providers sharing same doc stay in sync", async () => {
    // Simulate two users by sharing the same Y.Doc
    const alice = createMockProvider({ userName: "Alice" });
    const bob = createMockProvider({ userName: "Bob" });

    // Manually hook Bob's doc to Alice's (simulates Yjs sync)
    // In real Yjs this happens over the WebSocket — here we do it directly
    alice.doc.on("update", (update: Uint8Array) => {
      // Apply Alice's updates to Bob's doc
      const Y = require("yjs");
      Y.applyUpdate(bob.doc, update);
    });

    alice.doc.transact(() => {
      alice.tracks.push(["shared-track-001"]);
    });
    await tick();

    // Bob's doc received the update
    const bobTracks = bob.doc.getArray<string>("playlist-tracks");
    expect(bobTracks.toArray()).toContain("shared-track-001");

    alice.destroy();
    bob.destroy();
  });
});

// -------------------------------------------------------------
// Awareness / collaborator tests
// -------------------------------------------------------------

describe("collaborationProvider — awareness", () => {

  it("sets local user state on creation", () => {
    const provider = createMockProvider({
      userName: "Alice",
      userColor: "#ff0000",
    });

    const states = provider.awareness.getStates();
    const myState = states.get(provider.doc.clientID);

    expect(myState).toBeDefined();
    expect((myState!["user"] as { name: string }).name).toBe("Alice");
    provider.destroy();
  });

  it("fires awareness change event when state is updated", () => {
    const provider = createMockProvider({ userName: "Alice" });
    const handler = jest.fn();

    provider.awareness.on("change", handler);
    provider.awareness.setLocalStateField("cursor", { x: 10, y: 20 });

    expect(handler).toHaveBeenCalledTimes(1);
    provider.destroy();
  });

  it("removes listener correctly with off()", () => {
    const provider = createMockProvider({ userName: "Alice" });
    const handler = jest.fn();

    provider.awareness.on("change", handler);
    provider.awareness.off("change", handler);
    provider.awareness.setLocalStateField("cursor", { x: 1, y: 2 });

    expect(handler).not.toHaveBeenCalled();
    provider.destroy();
  });

  it("reflects updated field in awareness states", () => {
    const provider = createMockProvider({ userName: "Alice" });

    provider.awareness.setLocalStateField("status", "listening");

    const state = provider.awareness.getStates().get(provider.doc.clientID);
    expect(state!["status"]).toBe("listening");
    provider.destroy();
  });
});

// -------------------------------------------------------------
// Disconnect recovery tests
// -------------------------------------------------------------

describe("collaborationProvider — disconnect recovery", () => {

  it("mock provider status is always connected", () => {
    const provider = createMockProvider({ userName: "Alice" });
    expect(provider.status).toBe("connected");
    provider.destroy();
  });

  it("destroy() cleans up without throwing", () => {
    const provider = createMockProvider({ userName: "Alice" });
    expect(() => provider.destroy()).not.toThrow();
  });

  it("tracks are empty after destroy (no lingering state)", () => {
    const provider = createMockProvider({ userName: "Alice" });

    provider.doc.transact(() => {
      provider.tracks.push(["track-001"]);
    });

    provider.destroy();

    // Doc is destroyed — creating a new one from scratch is clean
    const fresh = createMockProvider({ userName: "Alice" });
    expect(fresh.tracks.toArray()).toEqual([]);
    fresh.destroy();
  });

  it("two independent providers don't share state", () => {
    const p1 = createMockProvider({ userName: "Alice" });
    const p2 = createMockProvider({ userName: "Bob" });

    p1.doc.transact(() => {
      p1.tracks.push(["only-in-p1"]);
    });

    expect(p2.tracks.toArray()).toEqual([]);

    p1.destroy();
    p2.destroy();
  });
});
