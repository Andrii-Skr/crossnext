"use client";

import { useEffect } from "react";

export function ReactGrabInitializer() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const initReactGrab = async () => {
      const { getGlobalApi } = await import("react-grab");
      const api = getGlobalApi();

      if (!api) return;

      api.setOptions({
        activationMode: "hold",
        keyHoldDuration: 250,
        allowActivationInsideInput: false,
      });
    };

    void initReactGrab();
  }, []);

  return null;
}
