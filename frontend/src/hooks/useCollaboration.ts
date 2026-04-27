import { useEffect, useRef, useState, useCallback } from "react";
import {
  createCollaborationProvider,
  CollaborationProvider,
  Collaborator,
  ProviderConfig,
} from "../collaboration/collaborationProvider";



export interface UseCollaborationOptions {
  roomId: string;
  userName: string;
  userColor?: string;
}

export interface UseCollaborationReturn {
  /** Ordered list of track IDs in the shared playlist */
  trackIds: string[];

  /** Who else is currently in the session */
  collaborators: Collaborator[];

  /** Connection health */
  connectionStatus: CollaborationProvider["status"];

  /** Add a track to the end of the shared playlist */
  addTrack: (trackId: string) => void;

  /** Remove a track by index */
  removeTrack: (index: number) => void;

  /** Move a track from one index to another */
  moveTrack: (fromIndex: number, toIndex: number) => void;

  /** Whether this hook has finished setting up */
  isReady: boolean;
}



export function useCollaboration({
  roomId,
  userName,
  userColor,
}: UseCollaborationOptions): UseCollaborationReturn {
  const providerRef = useRef<CollaborationProvider | null>(null);

  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<CollaborationProvider["status"]>("connecting");
  const [isReady, setIsReady] = useState(false);

  // ----------------------------------------------------------
  // Boot: create provider, wire up observers
  // ----------------------------------------------------------
  useEffect(() => {
    if (!roomId || !userName) return;

    const provider = createCollaborationProvider({ roomId, userName, userColor });
    providerRef.current = provider;

    // -- Track list observer --
    const syncTracks = () => {
      setTrackIds(provider.tracks.toArray());
    };
    provider.tracks.observe(syncTracks);
    syncTracks(); // load initial state

    // -- Awareness observer (collaborators) --
    const syncAwareness = () => {
      const states = provider.awareness.getStates();
      const list: Collaborator[] = [];

      states.forEach((state, clientId) => {
        const user = state["user"] as
          | { name: string; color: string; joinedAt: number }
          | undefined;
        if (user) {
          list.push({
            id: clientId,
            name: user.name,
            color: user.color ?? "#4DA3FF",
            joinedAt: user.joinedAt ?? Date.now(),
          });
        }
      });

      setCollaborators(list);
    };

    provider.awareness.on("change", syncAwareness);
    syncAwareness(); // load who's already here

    // -- Connection status polling --
    // (WebsocketProvider fires "status" events; mock is always connected)
    const statusInterval = setInterval(() => {
      setConnectionStatus(provider.status);
    }, 1000);

    setConnectionStatus(provider.status);
    setIsReady(true);

    // -- Cleanup on unmount or roomId change --
    return () => {
      provider.tracks.unobserve(syncTracks);
      provider.awareness.off("change", syncAwareness);
      clearInterval(statusInterval);
      provider.destroy();
      providerRef.current = null;
      setIsReady(false);
    };
  }, [roomId, userName, userColor]);

  // ----------------------------------------------------------
  // Track operations — always go through the shared Yjs doc
  // ----------------------------------------------------------

  const addTrack = useCallback((trackId: string) => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.doc.transact(() => {
      provider.tracks.push([trackId]);
    });
  }, []);

  const removeTrack = useCallback((index: number) => {
    const provider = providerRef.current;
    if (!provider) return;
    if (index < 0 || index >= provider.tracks.length) return;
    provider.doc.transact(() => {
      provider.tracks.delete(index, 1);
    });
  }, []);

  const moveTrack = useCallback((fromIndex: number, toIndex: number) => {
    const provider = providerRef.current;
    if (!provider) return;
    const tracks = provider.tracks;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tracks.length ||
      toIndex >= tracks.length
    ) return;

    provider.doc.transact(() => {
      const [item] = tracks.toArray().splice(fromIndex, 1);
      tracks.delete(fromIndex, 1);
      tracks.insert(toIndex, [item]);
    });
  }, []);

  return {
    trackIds,
    collaborators,
    connectionStatus,
    addTrack,
    removeTrack,
    moveTrack,
    isReady,
  };
}
