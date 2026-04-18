"use client";

import { useEffect } from "react";

export function WidgetDogfood() {
  useEffect(() => {
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;

    import("@colaborate/widget").then(({ initColaborate }) => {
      if (destroyed) return;
      instance = initColaborate({
        endpoint: "/api/colaborate",
        projectName: "landing",
        forceShow: true,
        accentColor: "#173CFF",
        locale: "en",
        position: "bottom-right",
      });
    });

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, []);

  return null;
}
