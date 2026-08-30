"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { InstamartAddresses } from "@/features/instamart/contracts";
import type { HouseholdShoppingList } from "@/features/shopping/contracts";
import styles from "@/app/homeowner/shopping/shopping.module.css";

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body;
}

export function HomeownerShoppingList({
  initialList,
  initiallyConnected,
}: {
  initialList: HouseholdShoppingList;
  initiallyConnected: boolean;
}) {
  const [list, setList] = useState(initialList);
  const [name, setName] = useState("");
  const [quantityNote, setQuantityNote] = useState("");
  const [addresses, setAddresses] = useState<InstamartAddresses | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [busy, setBusy] = useState<"add" | "addresses" | "prices" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantityNote }),
      });
      setList(await responseBody<HouseholdShoppingList>(response));
      setName("");
      setQuantityNote("");
      setMessage("Item added to the household list.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The item could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(itemId: string) {
    setBusy(itemId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/shopping-list/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      setList(await responseBody<HouseholdShoppingList>(response));
      setMessage("Item removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The item could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  async function loadAddresses(page = 1) {
    setBusy("addresses");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/homeowner/instamart/addresses?page=${page}`, { cache: "no-store" });
      const next = await responseBody<InstamartAddresses>(response);
      setAddresses((current) => page > 1 && current
        ? { addresses: [...current.addresses, ...next.addresses], pagination: next.pagination }
        : next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Addresses could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshPrices() {
    setBusy("prices");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/homeowner/shopping-list/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedAddressId }),
      });
      setList(await responseBody<HouseholdShoppingList>(response));
      setMessage("Instamart price check complete. Results were saved to the household list.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prices could not be refreshed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="add-item-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Household list</p><h2 id="add-item-heading">Add an ingredient</h2></div>
          <span>{list.items.length} item{list.items.length === 1 ? "" : "s"}</span>
        </div>
        <form className={styles.addForm} onSubmit={addItem}>
          <label htmlFor="shopping-item">Ingredient</label>
          <input id="shopping-item" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} placeholder="For example, tomatoes" required />
          <label htmlFor="shopping-quantity">Quantity or note <span>(optional)</span></label>
          <input id="shopping-quantity" value={quantityNote} onChange={(event) => setQuantityNote(event.target.value)} maxLength={40} placeholder="For example, 1 kg" />
          <button className={styles.primaryButton} type="submit" disabled={busy !== null}>{busy === "add" ? "Adding…" : "Add to list"}</button>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="list-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Shared with househelp</p><h2 id="list-heading">Shopping list</h2></div>
        </div>
        {list.items.length ? (
          <ul className={styles.itemList}>
            {list.items.map((item) => (
              <li key={item.id}>
                <div className={styles.itemMain}>
                  <div><h3>{item.name}</h3>{item.quantityNote ? <p>{item.quantityNote}</p> : null}</div>
                  <button className={styles.removeButton} type="button" onClick={() => void removeItem(item.id)} disabled={busy !== null} aria-label={`Remove ${item.name}`}>
                    {busy === item.id ? "Removing…" : "Remove"}
                  </button>
                </div>
                <PriceSnapshot item={item} />
              </li>
            ))}
          </ul>
        ) : <p className={styles.emptyState}>Add the ingredients your household needs to buy.</p>}
      </section>

      <section className={styles.panel} aria-labelledby="prices-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Instamart · read only</p><h2 id="prices-heading">Get current prices</h2></div>
        </div>
        {!initiallyConnected ? (
          <div className={styles.connectCallout}>
            <p>Connect Swiggy before checking local prices.</p>
            <Link className={styles.primaryLink} href="/homeowner/instamart-prices">Connect Swiggy</Link>
          </div>
        ) : !addresses ? (
          <button className={styles.secondaryButton} type="button" onClick={() => void loadAddresses()} disabled={busy !== null || !list.items.length}>
            {busy === "addresses" ? "Loading addresses…" : "Choose saved address"}
          </button>
        ) : (
          <div className={styles.priceControls}>
            <fieldset className={styles.addressList}>
              <legend>Delivery address</legend>
              {addresses.addresses.map((address) => (
                <label key={address.id}>
                  <input type="radio" name="shopping-address" checked={selectedAddressId === address.id} onChange={() => setSelectedAddressId(address.id)} />
                  <span><strong>{address.addressTag ?? address.addressCategory ?? "Saved address"}</strong><small>{address.addressLine}</small></span>
                </label>
              ))}
            </fieldset>
            {addresses.pagination.hasMore ? (
              <button className={styles.textButton} type="button" onClick={() => void loadAddresses(addresses.pagination.page + 1)} disabled={busy !== null}>Show more addresses</button>
            ) : null}
            <button className={styles.primaryButton} type="button" onClick={() => void refreshPrices()} disabled={!selectedAddressId || busy !== null || !list.items.length}>
              {busy === "prices" ? "Checking every item…" : "Check prices for this list"}
            </button>
          </div>
        )}
        <p className={styles.finePrint}>We save Swiggy’s first available ranked match for each ingredient. Verify the product and pack size; prices and stock can change.</p>
      </section>

      {error ? <p className={styles.errorPanel} role="alert">{error}</p> : null}
      {message ? <p className={styles.successPanel} role="status">{message}</p> : null}
    </div>
  );
}

function PriceSnapshot({ item }: { item: HouseholdShoppingList["items"][number] }) {
  if (!item.price) {
    const text = item.priceStatus === "not_found"
      ? "No available Instamart match found."
      : item.priceStatus === "error"
        ? "Price refresh failed. Try again."
        : "Price not checked yet.";
    return <p className={styles.priceEmpty}>{text}</p>;
  }
  return (
    <div className={styles.priceCard}>
      <div><strong>{item.price.productName}</strong><span>{item.price.brandName || "Instamart"} · {item.price.packSize}</span></div>
      <div className={styles.priceValue}><strong>{money(item.price.offerPrice)}</strong>{item.price.mrp > item.price.offerPrice ? <s>{money(item.price.mrp)}</s> : null}</div>
      <small>{item.priceStatus === "error" ? "Last saved price · latest refresh failed" : `Checked ${new Date(item.price.checkedAt).toLocaleString("en-IN")}`}</small>
    </div>
  );
}
