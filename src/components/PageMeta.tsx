import { Helmet } from "react-helmet-async";

interface Props {
  title: string;
  description: string;
  /** Path part of the canonical URL, e.g. "/privacy". Defaults to current pathname. */
  path?: string;
  /** Skip indexing this route. */
  noindex?: boolean;
}

const SITE_ORIGIN = "https://thecreativesroom.com";

export function PageMeta({ title, description, path, noindex }: Props) {
  const pathname = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const canonical = `${SITE_ORIGIN}${pathname}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}
