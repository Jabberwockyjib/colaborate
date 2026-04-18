"use client";

import { useEffect } from "react";

export function WidgetInit() {
  useEffect(() => {
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;

    import("@colaborate/widget").then(({ initColaborate }) => {
      if (destroyed) return;
      instance = initColaborate({
        endpoint: "/api/colaborate",
        projectName: "demo",
        forceShow: true,
        accentColor: "#173CFF",
        locale: "en",
      });
    });

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, []);

  return null;
}
