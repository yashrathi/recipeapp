"use client";

import { useState, type FormEvent } from "react";

import type { InstamartAddresses, InstamartSearch } from "@/features/instamart/contracts";
import styles from "@/app/homeowner/instamart-prices/instamart.module.css";

type SearchResponse = InstamartSearch & { checkedAt: string };

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body;
}

export function PriceChecker({ initiallyConnected }: { initiallyConnected: boolean }) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [addresses, setAddresses] = useState<InstamartAddresses | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAddresses(page = 1) {
    setLoadingAddresses(true);
    setError(null);
    try {
      const response = await fetch(`/api/homeowner/instamart/addresses?page=${page}`, {
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 409) setConnected(false);
      const next = await responseBody<InstamartAddresses>(response);
      setAddresses((current) => page > 1 && current
        ? { addresses: [...current.addresses, ...next.addresses], pagination: next.pagination }
        : next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Addresses could not be loaded.");
    } finally {
      setLoadingAddresses(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch("/api/homeowner/instamart/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedAddressId, query }),
      });
      if (response.status === 401 || response.status === 409) setConnected(false);
      setResults(await responseBody<SearchResponse>(response));
      setSearchedQuery(query.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prices could not be loaded.");
    } finally {
      setSearching(false);
    }
  }

  if (!connected) {
    return (
      <section className={styles.connectCard} aria-labelledby="connect-heading">
        <p className={styles.badge}>Read-only local test</p>
        <h2 id="connect-heading">Connect your Swiggy account</h2>
        <p>Swiggy uses your saved delivery address to return local Instamart availability and prices.</p>
        <form action="/api/homeowner/instamart/connect" method="post">
          <button className={styles.primaryButton} type="submit">Connect Swiggy</button>
        </form>
        <p className={styles.finePrint}>The access token stays in this local server's memory and disappears when it restarts. This test cannot change a cart or place an order.</p>
      </section>
    );
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.connectionBar} aria-label="Swiggy connection">
        <div><span className={styles.liveDot} aria-hidden="true" /><strong>Swiggy connected</strong><span>Local session only</span></div>
        <form action="/api/homeowner/instamart/disconnect" method="post">
          <button className={styles.textButton} type="submit">Disconnect</button>
        </form>
      </section>

      {!addresses ? (
        <section className={styles.stepCard} aria-labelledby="address-heading">
          <span className={styles.stepNumber}>1</span>
          <div>
            <h2 id="address-heading">Choose the delivery address</h2>
            <p>We show the address only long enough for you to choose it. Phone numbers are not displayed.</p>
            <button className={styles.primaryButton} type="button" onClick={() => loadAddresses()} disabled={loadingAddresses}>
              {loadingAddresses ? "Loading addresses…" : "Show saved addresses"}
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.stepCard} aria-labelledby="address-heading">
          <span className={styles.stepNumber}>1</span>
          <div className={styles.stepContent}>
            <h2 id="address-heading">Choose the delivery address</h2>
            {addresses.addresses.length ? (
              <fieldset className={styles.addressList}>
                <legend className={styles.srOnly}>Saved Swiggy addresses</legend>
                {addresses.addresses.map((address) => (
                  <label className={styles.addressOption} key={address.id}>
                    <input
                      type="radio"
                      name="instamart-address"
                      value={address.id}
                      checked={selectedAddressId === address.id}
                      onChange={() => { setSelectedAddressId(address.id); setResults(null); }}
                    />
                    <span><strong>{address.addressTag ?? address.addressCategory ?? "Saved address"}</strong><small>{address.addressLine}</small></span>
                  </label>
                ))}
              </fieldset>
            ) : <p>No saved Swiggy addresses were returned.</p>}
            {addresses.pagination.hasMore ? (
              <button className={styles.secondaryButton} type="button" onClick={() => loadAddresses(addresses.pagination.page + 1)} disabled={loadingAddresses}>
                {loadingAddresses ? "Loading…" : "Show more addresses"}
              </button>
            ) : null}
          </div>
        </section>
      )}

      <section className={styles.stepCard} aria-labelledby="search-heading" aria-disabled={!selectedAddressId}>
        <span className={styles.stepNumber}>2</span>
        <div className={styles.stepContent}>
          <h2 id="search-heading">Check an ingredient price</h2>
          <p>Search one ingredient at a time, then compare the available brands and pack sizes.</p>
          <form className={styles.searchForm} onSubmit={search}>
            <label htmlFor="ingredient-query">Ingredient</label>
            <div>
              <input
                id="ingredient-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="For example, tomatoes"
                minLength={2}
                maxLength={100}
                required
                disabled={!selectedAddressId || searching}
              />
              <button className={styles.primaryButton} type="submit" disabled={!selectedAddressId || searching}>
                {searching ? "Checking…" : "Check price"}
              </button>
            </div>
          </form>
        </div>
      </section>

      {error ? <div className={styles.errorPanel} role="alert">{error}</div> : null}
      {results ? <ProductResults results={results} query={searchedQuery} /> : null}
    </div>
  );
}

function ProductResults({ results, query }: { results: SearchResponse; query: string }) {
  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <div className={styles.resultsHeader}>
        <div><p className={styles.badge}>Live Instamart snapshot</p><h2 id="results-heading">Prices for “{query}”</h2></div>
        <time dateTime={results.checkedAt}>Checked {new Date(results.checkedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</time>
      </div>
      {results.products.length ? (
        <div className={styles.productGrid}>
          {results.products.flatMap((product) => product.variations.map((variation) => (
            <article className={styles.productCard} key={variation.spinId}>
              <div><p className={styles.brand}>{variation.brandName || product.brand || "Instamart"}</p><h3>{variation.displayName}</h3><p>{variation.quantityDescription}</p></div>
              <div className={styles.priceRow}>
                <strong>{money(variation.price.offerPrice)}</strong>
                {variation.price.mrp > variation.price.offerPrice ? <s>{money(variation.price.mrp)}</s> : null}
              </div>
              {variation.price.unitLevelPrice ? <p className={styles.unitPrice}>{variation.price.unitLevelPrice}</p> : null}
              <span className={variation.isInStockAndAvailable ? styles.inStock : styles.outOfStock}>
                {variation.isInStockAndAvailable ? "Available" : "Out of stock"}
              </span>
              {variation.maxQuantityMessage ? <small>{variation.maxQuantityMessage}</small> : null}
            </article>
          ))) }
        </div>
      ) : <p className={styles.emptyState}>No matching products were returned for this address.</p>}
      {results.similarProducts?.length ? <p className={styles.similarNote}>Swiggy also returned {results.similarProducts.length} similar product{results.similarProducts.length === 1 ? "" : "s"}. They are not mixed into the exact matches.</p> : null}
      <p className={styles.priceDisclaimer}>Search prices can change with stock and offers. Delivery fees, coupons, and the final payable total are not included.</p>
    </section>
  );
}
