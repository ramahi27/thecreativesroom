import { useEffect } from "react";

/**
 * Inject a JSON-LD <script> into <head> for the duration of this component.
 * Pass null to skip. The script is removed on unmount or when the data changes.
 */
export function useJsonLd(data: Record<string, unknown> | null, id?: string) {
  useEffect(() => {
    if (!data) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    if (id) script.setAttribute("data-jsonld-id", id);
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [data, id]);
}
