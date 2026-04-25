import React, { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
   Types & Contracts
========================================================= */

type SearchFilters = Record<string, string | number | boolean>;

type Suggestion = {
  id: string;
  label: string;
  type?: "recent" | "suggestion" | "voice";
};

type SearchState = {
  query: string;
  parsedQuery: Record<string, any>;
  filters: SearchFilters;
  suggestions: Suggestion[];
  history: string[];
  loading: boolean;
};

type SuggestionProvider = (query: string) => Promise<Suggestion[]>;

/* =========================================================
   Utils
========================================================= */

const STORAGE_KEY = "drip_search_history";

const debounce = (fn: (...args: any[]) => void, delay: number) => {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const parseQuery = (query: string) => {
  // Example: "status:open type:card hello"
  const tokens = query.split(" ");
  const parsed: Record<string, any> = { text: [] };

  tokens.forEach((token) => {
    if (token.includes(":")) {
      const [key, value] = token.split(":");
      parsed[key] = value;
    } else {
      parsed.text.push(token);
    }
  });

  return parsed;
};

const loadHistory = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveHistory = (history: string[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

/* =========================================================
   Search Store (Centralized State)
========================================================= */

class SearchStore {
  private state: SearchState;
  private listeners: Set<(state: SearchState) => void> = new Set();
  private provider: SuggestionProvider;

  constructor(provider: SuggestionProvider) {
    this.provider = provider;
    this.state = {
      query: "",
      parsedQuery: {},
      filters: {},
      suggestions: [],
      history: loadHistory(),
      loading: false,
    };
  }

  subscribe(listener: (state: SearchState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }

  getState() {
    return this.state;
  }

  setQuery(query: string) {
    this.state.query = query;
    this.state.parsedQuery = parseQuery(query);
    this.notify();
    this.fetchSuggestionsDebounced(query);
  }

  setFilters(filters: SearchFilters) {
    this.state.filters = filters;
    this.notify();
  }

  async fetchSuggestions(query: string) {
    if (!query) {
      this.state.suggestions = [];
      this.notify();
      return;
    }

    this.state.loading = true;
    this.notify();

    const suggestions = await this.provider(query);

    this.state.suggestions = suggestions;
    this.state.loading = false;
    this.notify();
  }

  fetchSuggestionsDebounced = debounce((query: string) => {
    this.fetchSuggestions(query);
  }, 300);

  addToHistory(query: string) {
    if (!query.trim()) return;

    const newHistory = [query, ...this.state.history.filter((q) => q !== query)].slice(0, 10);
    this.state.history = newHistory;
    saveHistory(newHistory);
    this.notify();
  }

  clearHistory() {
    this.state.history = [];
    saveHistory([]);
    this.notify();
  }
}

/* =========================================================
   Hook
========================================================= */

export const useSearch = (store: SearchStore) => {
  const [state, setState] = useState<SearchState>(store.getState());

  useEffect(() => {
    return store.subscribe(setState);
  }, [store]);

  return {
    ...state,
    setQuery: store.setQuery.bind(store),
    setFilters: store.setFilters.bind(store),
    addToHistory: store.addToHistory.bind(store),
    clearHistory: store.clearHistory.bind(store),
  };
};

/* =========================================================
   Mock Suggestion Provider (Replaceable)
========================================================= */

const mockProvider: SuggestionProvider = async (query) => {
  await new Promise((r) => setTimeout(r, 200));

  return [
    { id: "1", label: `${query} result 1`, type: "suggestion" },
    { id: "2", label: `${query} result 2`, type: "suggestion" },
  ];
};

/* =========================================================
   Search Component
========================================================= */

export const SearchBar: React.FC = () => {
  const storeRef = useRef<SearchStore>();
  if (!storeRef.current) {
    storeRef.current = new SearchStore(mockProvider);
  }

  const {
    query,
    suggestions,
    history,
    loading,
    setQuery,
    addToHistory,
    clearHistory,
  } = useSearch(storeRef.current);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addToHistory(query);
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <form onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          style={{ width: "100%", padding: 8 }}
        />
      </form>

      {loading && <p>Loading...</p>}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((s) => (
            <li key={s.id}>{s.label}</li>
          ))}
        </ul>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <h4>Recent</h4>
          <ul>
            {history.map((h, i) => (
              <li key={i} onClick={() => setQuery(h)}>
                {h}
              </li>
            ))}
          </ul>
          <button onClick={clearHistory}>Clear</button>
        </>
      )}
    </div>
  );
};

/* =========================================================
   Export Store Factory (for reuse across pages)
========================================================= */

export const createSearchStore = (provider?: SuggestionProvider) => {
  return new SearchStore(provider || mockProvider);
};