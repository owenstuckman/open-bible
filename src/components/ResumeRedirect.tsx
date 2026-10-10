"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const LAST_READ_KEY = "ob:last";

export function ResumeRedirect() {
  const router = useRouter();
  useEffect(() => {
    let target = "/read/GEN/1";
    try {
      const last = localStorage.getItem(LAST_READ_KEY);
      if (last && /^\/read\/[0-9A-Z]{3}\/\d+$/.test(last)) target = last;
    } catch {}
    router.replace(target);
  }, [router]);
  return null;
}
