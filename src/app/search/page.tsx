import { Suspense } from "react";
import { SearchView } from "@/components/search/SearchView";

export const metadata = { title: "Search · Open Bible" };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
