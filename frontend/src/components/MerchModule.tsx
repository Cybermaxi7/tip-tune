import React, { useEffect, useState } from "react";

/* =========================================================
   Types
========================================================= */

export type MerchItem = {
  id: string;
  name: string;
  price: number;
  createdAt: number;
  order: number;
  wished?: boolean;
};

/* =========================================================
   Repository Interface
========================================================= */

export interface MerchRepository {
  getAll(): Promise<MerchItem[]>;
  create(item: Omit<MerchItem, "id" | "createdAt" | "order">): Promise<MerchItem>;
  update(id: string, updates: Partial<MerchItem>): Promise<MerchItem>;
  delete(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  toggleWishlist(id: string): Promise<MerchItem>;
}

/* =========================================================
   LocalStorage Implementation (Offline-first)
========================================================= */

const STORAGE_KEY = "drip_merch";

const readStorage = (): MerchItem[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeStorage = (items: MerchItem[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export class LocalMerchRepository implements MerchRepository {
  async getAll() {
    return readStorage().sort((a, b) => a.order - b.order);
  }

  async create(item: Omit<MerchItem, "id" | "createdAt" | "order">) {
    const items = readStorage();
    const newItem: MerchItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      order: items.length,
      wished: false,
    };

    const updated = [...items, newItem];
    writeStorage(updated);
    return newItem;
  }

  async update(id: string, updates: Partial<MerchItem>) {
    const items = readStorage();
    const updatedItems = items.map((i) =>
      i.id === id ? { ...i, ...updates } : i
    );

    writeStorage(updatedItems);
    return updatedItems.find((i) => i.id === id)!;
  }

  async delete(id: string) {
    let items = readStorage();
    items = items.filter((i) => i.id !== id);
    // re-order
    items = items.map((i, idx) => ({ ...i, order: idx }));
    writeStorage(items);
  }

  async reorder(ids: string[]) {
    const items = readStorage();
    const map = new Map(items.map((i) => [i.id, i]));

    const reordered = ids.map((id, idx) => ({
      ...map.get(id)!,
      order: idx,
    }));

    writeStorage(reordered);
  }

  async toggleWishlist(id: string) {
    const items = readStorage();
    const updated = items.map((i) =>
      i.id === id ? { ...i, wished: !i.wished } : i
    );

    writeStorage(updated);
    return updated.find((i) => i.id === id)!;
  }
}

/* =========================================================
   Mock Repository (for tests)
========================================================= */

export class InMemoryMerchRepository implements MerchRepository {
  private items: MerchItem[] = [];

  async getAll() {
    return [...this.items].sort((a, b) => a.order - b.order);
  }

  async create(item: Omit<MerchItem, "id" | "createdAt" | "order">) {
    const newItem: MerchItem = {
      ...item,
      id: Math.random().toString(),
      createdAt: Date.now(),
      order: this.items.length,
      wished: false,
    };

    this.items.push(newItem);
    return newItem;
  }

  async update(id: string, updates: Partial<MerchItem>) {
    this.items = this.items.map((i) =>
      i.id === id ? { ...i, ...updates } : i
    );
    return this.items.find((i) => i.id === id)!;
  }

  async delete(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.items = this.items.map((i, idx) => ({ ...i, order: idx }));
  }

  async reorder(ids: string[]) {
    const map = new Map(this.items.map((i) => [i.id, i]));
    this.items = ids.map((id, idx) => ({
      ...map.get(id)!,
      order: idx,
    }));
  }

  async toggleWishlist(id: string) {
    this.items = this.items.map((i) =>
      i.id === id ? { ...i, wished: !i.wished } : i
    );
    return this.items.find((i) => i.id === id)!;
  }
}

/* =========================================================
   Component (Refactored)
========================================================= */

export const MerchManagementPanel: React.FC<{
  repository?: MerchRepository;
}> = ({ repository }) => {
  const repo = repository || new LocalMerchRepository();

  const [items, setItems] = useState<MerchItem[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const load = async () => {
    const data = await repo.getAll();
    setItems(data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name || !price) return;
    await repo.create({ name, price: Number(price) });
    setName("");
    setPrice("");
    load();
  };

  const handleDelete = async (id: string) => {
    await repo.delete(id);
    load();
  };

  const handleToggleWishlist = async (id: string) => {
    await repo.toggleWishlist(id);
    load();
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2>Merch Management</h2>

      <div>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button onClick={handleCreate}>Add</button>
      </div>

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.name} - ${item.price}{" "}
            {item.wished && <span>❤️</span>}
            <button onClick={() => handleToggleWishlist(item.id)}>
              Toggle Wishlist
            </button>
            <button onClick={() => handleDelete(item.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};