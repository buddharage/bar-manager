import { createServerClient } from "@/lib/supabase/server";
import { GiftCardList } from "./gift-card-list";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage() {
  const supabase = createServerClient();

  const { data: giftCards } = await supabase
    .from("gift_cards")
    .select("*")
    .order("created_at", { ascending: false });

  return <GiftCardList initialCards={giftCards || []} />;
}
