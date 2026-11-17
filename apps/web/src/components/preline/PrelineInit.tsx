import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

export function PrelineInit() {
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;

    void import("preline/non-auto")
      .then(({ HSStaticMethods }) => {
        if (active) HSStaticMethods.autoInit();
      })
      .catch((error: unknown) => {
        console.error("Preline initialization failed", error);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  return null;
}
