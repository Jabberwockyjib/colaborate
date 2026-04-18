import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://colaborate.develotype.com", lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    {
      url: "https://colaborate.develotype.com/demo",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
