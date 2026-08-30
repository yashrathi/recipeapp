import type { HousehelpLocale } from "@/features/househelp/types";
import type { HouseholdShoppingList, ShoppingListItem } from "@/features/shopping/contracts";

export function househelpPriceText(item: ShoppingListItem, locale: HousehelpLocale): string {
  if (item.priceStatus === "not_found") {
    return locale === "hi-IN" ? "इंस्टामार्ट पर नहीं मिला" : "No Instamart match";
  }
  if (item.priceStatus === "error") {
    return locale === "hi-IN" ? "कीमत जाँच नहीं हुई" : "Price check failed";
  }
  return locale === "hi-IN" ? "कीमत बाकी" : "Price pending";
}

export function spokenShoppingList(list: HouseholdShoppingList, locale: HousehelpLocale): string {
  const heading = locale === "hi-IN" ? "खरीदारी की सूची।" : "Shopping list.";
  if (!list.items.length) {
    return `${heading} ${locale === "hi-IN" ? "सूची खाली है।" : "The list is empty."}`;
  }

  const items = list.items.map((item, index) => {
    const quantity = item.quantityNote ? `, ${item.quantityNote}` : "";
    const price = spokenPrice(item, locale);
    return `${index + 1}. ${item.name}${quantity}${price}.`;
  });
  return `${heading} ${items.join(" ")}`;
}

function spokenPrice(item: ShoppingListItem, locale: HousehelpLocale): string {
  if (item.price) {
    return locale === "hi-IN"
      ? `, ${Math.round(item.price.offerPrice)} रुपये, ${item.price.packSize} के लिए`
      : `, ${Math.round(item.price.offerPrice)} rupees for ${item.price.packSize}`;
  }
  if (item.priceStatus === "not_found") {
    return locale === "hi-IN" ? ", कीमत नहीं मिली" : ", price not found";
  }
  if (item.priceStatus === "error") {
    return locale === "hi-IN" ? ", कीमत जाँच नहीं हुई" : ", price check failed";
  }
  return locale === "hi-IN" ? ", कीमत अभी जाँची नहीं गई" : ", price not checked";
}
