import { Helmet } from "react-helmet-async";

interface Props {
  title: string;
  description: string;
  /** Path part of the canonical URL, e.g. "/privacy". Defaults to current pathname. */
  path?: string;
  /** Absolute URL for og:image / twitter:image. Falls back to site default. */
  ogImage?: string;
  /** Skip indexing this route. */
  noindex?: boolean;
}

const SITE_ORIGIN = "https://thecreativesroom.com";
const DEFAULT_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/85b2d7b6-2ea9-40f1-9a84-ff6ce724a400/id-preview-6e9b7ec6--c1071d5f-a0f4-47b6-a6b0-b43f20d0a8c0.lovable.app-1777200045504.png";

export function PageMeta({ title, description, path, ogImage, noindex }: Props) {
  const pathname = path ?? window.location.pathname;
  const canonical = `${SITE_ORIGIN}${pathname}`;
  const image = ogImage || DEFAULT_OG_IMAGE;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta name="author" content="The Creatives Room" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@thecreativesroom" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}
