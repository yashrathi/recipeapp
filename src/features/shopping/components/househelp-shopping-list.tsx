"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/app/househelp/shopping/shopping.module.css";
import type { HouseholdShoppingList } from "@/features/shopping/contracts";
import { BrowserSpeechAdapter } from "@/features/househelp/speech";
import type { HousehelpLocale } from "@/features/househelp/types";
import { househelpPriceText, spokenShoppingList } from "@/features/shopping/components/househelp-copy";

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
}

export function HousehelpShoppingList({
  list,
  locale,
}: {
  list: HouseholdShoppingList;
  locale: HousehelpLocale;
}) {
  const speech = useMemo(() => new BrowserSpeechAdapter(), []);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => () => speech.cancel(), [speech]);

  async function hearList() {
    if (speaking) {
      speech.cancel();
      setSpeaking(false);
      setStatus(locale === "hi-IN" ? "आवाज़ बंद।" : "Speech stopped.");
      return;
    }
    setSpeaking(true);
    setStatus("");
    try {
      if (!await speech.probe(locale)) throw new Error("voice unavailable");
      await speech.speak(spokenShoppingList(list, locale), locale);
      setStatus(locale === "hi-IN" ? "सूची पूरी हुई।" : "List finished.");
    } catch {
      setStatus(locale === "hi-IN" ? "आवाज़ उपलब्ध नहीं है। सूची स्क्रीन पर है।" : "Speech is unavailable. The list is shown on screen.");
    } finally {
      setSpeaking(false);
    }
  }

  async function backToToday() {
    speech.cancel();
    try {
      if (await speech.probe(locale)) {
        await speech.speak(locale === "hi-IN" ? "आज के काम पर वापस।" : "Back to Today.", locale);
      }
    } catch {
      // Navigation remains available when device speech fails.
    }
    window.location.assign("/househelp");
  }

  return (
    <main className={styles.shell}>
      <div className={styles.page}>
        <button className={styles.backButton} type="button" onClick={() => void backToToday()}>
          ← {locale === "hi-IN" ? "आज" : "Today"}
        </button>
        <header>
          <p>{locale === "hi-IN" ? "घर की सूची" : "Household list"}</p>
          <h1>{locale === "hi-IN" ? "खरीदारी की सूची" : "Shopping list"}</h1>
          <span>{locale === "hi-IN" ? "घर के मालिक ने यह सूची साझा की है।" : "The homeowner shared this list."}</span>
        </header>
        <button className={styles.hearButton} type="button" aria-pressed={speaking} onClick={() => void hearList()}>
          <span aria-hidden="true">{speaking ? "■" : "◖"}</span>
          {speaking
            ? locale === "hi-IN" ? "आवाज़ बंद करें" : "Stop"
            : locale === "hi-IN" ? "सूची सुनें" : "Hear list"}
        </button>
        <p className={styles.liveStatus} role="status" aria-live="polite">{status}</p>
        {list.items.length ? (
          <ol className={styles.list}>
            {list.items.map((item) => (
              <li key={item.id}>
                <div><strong>{item.name}</strong>{item.quantityNote ? <span>{item.quantityNote}</span> : null}</div>
                {item.price ? (
                  <div className={styles.price}><strong>{money(item.price.offerPrice)}</strong><span>{item.price.packSize}</span></div>
                ) : <span className={styles.pending}>{househelpPriceText(item, locale)}</span>}
              </li>
            ))}
          </ol>
        ) : <p className={styles.empty}>{locale === "hi-IN" ? "सूची खाली है।" : "The shopping list is empty."}</p>}
        <p className={styles.note}>{locale === "hi-IN" ? "कीमतें आखिरी जाँच के समय की हैं।" : "Prices are saved snapshots from the last check."}</p>
      </div>
    </main>
  );
}
