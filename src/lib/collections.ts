export type CollectionFilter = {
  tags?: string[];
  agency?: string;
  brand?: string;
  categories?: string[];
  type?: "video" | "image" | "link";
  yearMin?: number;
  yearMax?: number;
};

export type Collection = {
  slug: string;
  section: "best-of" | "agencies";
  title: string;
  headline: string;
  seoTitle: string;
  seoDescription: string;
  filter: CollectionFilter;
};

export const collections: Collection[] = [
  {
    slug: "cannes-lions-grand-prix-winners",
    section: "best-of",
    title: "Cannes Lions Grand Prix Winners",
    headline: "Cannes Lions Grand Prix",
    seoTitle: "Cannes Lions Grand Prix Winners — The Creatives Room",
    seoDescription: "The Grand Prix-winning campaigns from Cannes Lions. Creative work that set the benchmark for advertising.",
    filter: { tags: ["cannes", "cannes lions", "grand prix", "cannes lions grand prix"] },
  },
  {
    slug: "female-led-campaigns",
    section: "best-of",
    title: "Female-Led Campaigns",
    headline: "Female-Led Campaigns",
    seoTitle: "Best Female-Led Ad Campaigns — The Creatives Room",
    seoDescription: "A curated collection of campaigns championing women — from Always #LikeAGirl to Fearless Girl. The ads that changed the conversation.",
    filter: { tags: ["women", "female", "gender equality", "feminism", "girl", "like a girl", "women empowerment"] },
  },
  {
    slug: "best-print-ads",
    section: "best-of",
    title: "Best Print Ads of All Time",
    headline: "Best Print Ads",
    seoTitle: "Best Print Ads of All Time — The Creatives Room",
    seoDescription: "The greatest print advertising ever made. Copy-driven, concept-first work from the golden age of print and beyond.",
    filter: { type: "image", categories: ["Campaign", "Copy Driven"] },
  },
  {
    slug: "super-bowl-commercials",
    section: "best-of",
    title: "Best Super Bowl Commercials",
    headline: "Super Bowl Commercials",
    seoTitle: "Best Super Bowl Commercials Ever — The Creatives Room",
    seoDescription: "The most iconic Super Bowl ads ever made. From Apple 1984 to the spots that break the internet every February.",
    filter: { tags: ["super bowl", "super bowl ad", "superbowl"] },
  },
  {
    slug: "emotional-ads-that-make-you-cry",
    section: "best-of",
    title: "Emotional Ads That Make You Cry",
    headline: "Emotional Ads",
    seoTitle: "Most Emotional Ads That Make You Cry — The Creatives Room",
    seoDescription: "The ads that hit hardest. Tearjerkers, tributes, and campaigns that connect on a deeply human level.",
    filter: { tags: ["emotional", "heartwarming", "touching", "moving", "tear", "powerful"] },
  },
  {
    slug: "award-winning-campaigns",
    section: "best-of",
    title: "Award-Winning Ad Campaigns",
    headline: "Award-Winning Campaigns",
    seoTitle: "Award-Winning Ad Campaigns — The Creatives Room",
    seoDescription: "Grand Prix, Gold Lions, D&AD Black Pencils — the campaigns that swept the award shows and redefined what advertising can do.",
    filter: { tags: ["cannes lions", "d&ad", "clio", "award winning", "grand prix", "gold lion", "pencil"] },
  },
  {
    slug: "nike-best-ads",
    section: "best-of",
    title: "Nike's Greatest Ads",
    headline: "Nike",
    seoTitle: "Nike's Best Ads & Campaigns — The Creatives Room",
    seoDescription: "Just Do It. Nike's most iconic ads, from Bo Knows to Write the Future — the campaigns that made sport feel like art.",
    filter: { brand: "Nike" },
  },
  {
    slug: "wieden-and-kennedy-best-work",
    section: "agencies",
    title: "Wieden+Kennedy — Best Work",
    headline: "Wieden+Kennedy",
    seoTitle: "Wieden+Kennedy Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The agency behind Nike, Old Spice, and Honda. W+K's most celebrated campaigns, curated from the archive.",
    filter: { agency: "Wieden" },
  },
  {
    slug: "ogilvy-best-campaigns",
    section: "agencies",
    title: "Ogilvy — Best Campaigns",
    headline: "Ogilvy",
    seoTitle: "Ogilvy Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The house that David built. Ogilvy's most iconic campaigns from decades of defining what great advertising looks like.",
    filter: { agency: "Ogilvy" },
  },
  {
    slug: "bbdo-best-work",
    section: "agencies",
    title: "BBDO — Best Work",
    headline: "BBDO",
    seoTitle: "BBDO Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The work is everything. BBDO's most celebrated campaigns across decades of award-winning creativity.",
    filter: { agency: "BBDO" },
  },
];

export function findCollection(section: string, slug: string): Collection | undefined {
  return collections.find((c) => c.section === section && c.slug === slug);
}
