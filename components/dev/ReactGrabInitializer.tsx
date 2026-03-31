"use client";

import { useEffect } from "react";

export function ReactGrabInitializer() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (process.env.NEXT_PUBLIC_ENABLE_REACT_GRAB !== "1") return;

    let disposed = false;
    const initReactGrab = async () => {
      try {
        const { getGlobalApi } = await import("react-grab");
        if (disposed) return;

        const api = getGlobalApi();
        if (!api) return;

        api.setOptions({
          activationMode: "hold",
          keyHoldDuration: 250,
          allowActivationInsideInput: false,
        });
      } catch (error) {
        console.warn("[react-grab] initialization failed:", error);
      }
    };

    void initReactGrab();

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
