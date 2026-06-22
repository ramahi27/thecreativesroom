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
  intro: string;
  closing: string;
  related: string[];
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
    intro: "The Grand Prix is the highest honour at Cannes Lions — awarded to work that doesn't just win its category, but redefines it. These are campaigns that changed the brief, shifted culture, and made every other creative in the room rethink what advertising is capable of. From film and print to experiential and data-driven work, Grand Prix winners share one thing: they were impossible to ignore.",
    closing: "Studying Grand Prix winners is one of the fastest ways to calibrate your creative standard. Not to copy the executions — those moments have passed — but to understand the thinking underneath. What problem did they solve differently? What convention did they break? Use this archive as a benchmark, not a template.",
    related: ["award-winning-campaigns", "emotional-ads-that-make-you-cry"],
    filter: { tags: ["cannes", "cannes lions", "grand prix", "cannes lions grand prix"] },
  },
  {
    slug: "female-led-campaigns",
    section: "best-of",
    title: "Female-Led Campaigns",
    headline: "Female-Led Campaigns",
    seoTitle: "Best Female-Led Ad Campaigns — The Creatives Room",
    seoDescription: "A curated collection of campaigns championing women — from Always #LikeAGirl to Fearless Girl. The ads that changed the conversation.",
    intro: "Some of the most culturally significant advertising of the last two decades has centred on women — not as a target audience to flatter, but as a subject worth taking seriously. Campaigns like Always #LikeAGirl, Fearless Girl, and This Girl Can didn't just sell products; they changed how brands talk about gender and sparked conversations that went far beyond the media buy. This collection brings together the work that did it best.",
    closing: "What separates strong female-led campaigns from cynical ones is specificity. The work that lasts doesn't traffic in vague empowerment — it identifies a precise truth, names it clearly, and builds from there. If you're working on a brief in this space, this archive is a useful filter for what's been done well and what's become a cliché to avoid.",
    related: ["award-winning-campaigns", "cannes-lions-grand-prix-winners"],
    filter: { tags: ["women", "female", "gender equality", "feminism", "girl", "like a girl", "women empowerment"] },
  },
  {
    slug: "best-print-ads",
    section: "best-of",
    title: "Best Print Ads of All Time",
    headline: "Best Print Ads",
    seoTitle: "Best Print Ads of All Time — The Creatives Room",
    seoDescription: "The greatest print advertising ever made. Copy-driven, concept-first work from the golden age of print and beyond.",
    intro: "Print advertising is the purest test of an idea. No music to manipulate emotion, no motion to disguise a weak concept, no algorithm to put it in front of the right person at the right moment. Just a single image and a headline — sometimes not even that. The ads in this collection earn their place without any of those crutches. They work because the idea is airtight.",
    closing: "Every creative should spend time with great print work, even if they never make a print ad in their career. The discipline of communicating one thing, clearly, in a fixed frame is the foundation of all good creative thinking. If you can't express your idea as a print ad, it probably isn't a simple enough idea yet.",
    related: ["award-winning-campaigns", "cannes-lions-grand-prix-winners"],
    filter: { type: "image", categories: ["Campaign", "Copy Driven"] },
  },
  {
    slug: "super-bowl-commercials",
    section: "best-of",
    title: "Best Super Bowl Commercials",
    headline: "Super Bowl Commercials",
    seoTitle: "Best Super Bowl Commercials Ever — The Creatives Room",
    seoDescription: "The most iconic Super Bowl ads ever made. From Apple 1984 to the spots that break the internet every February.",
    intro: "For one night a year, commercials become the show. The Super Bowl is the only media event where a significant portion of the audience tunes in specifically to watch the advertising — which means the work has to earn that attention at an entirely different level. Some of the most iconic ads ever made debuted here: Apple's 1984, Budweiser's Whassup, and dozens of others that lodged themselves permanently in popular culture.",
    closing: "Super Bowl spots are a useful case study in high-stakes creative: enormous budgets, massive audiences, and no room for anything vague or forgettable. What works tends to be either very funny, very moving, or genuinely surprising. The campaigns that fail are usually the ones that tried to be all three. Use this collection to study how the best ones committed to a single clear idea and executed it without compromise.",
    related: ["emotional-ads-that-make-you-cry", "award-winning-campaigns"],
    filter: { tags: ["super bowl", "super bowl ad", "superbowl"] },
  },
  {
    slug: "emotional-ads-that-make-you-cry",
    section: "best-of",
    title: "Emotional Ads That Make You Cry",
    headline: "Emotional Ads",
    seoTitle: "Most Emotional Ads That Make You Cry — The Creatives Room",
    seoDescription: "The ads that hit hardest. Tearjerkers, tributes, and campaigns that connect on a deeply human level.",
    intro: "The most shared ads in history aren't the funniest — they're the ones that made people feel something real. Grief, pride, love, nostalgia, the particular ache of watching a child grow up. The campaigns in this collection found a genuine human truth and built toward it honestly, without sentimentality for its own sake. That's the difference between an ad that moves people and one that merely tries to.",
    closing: "Emotion in advertising isn't a formula — it's a consequence of specificity. The ads that make you cry work because they're precise: a particular moment, a particular relationship, a particular detail that suddenly makes something universal feel personal. Study these not for the emotional beats, but for how the writers and directors earned them.",
    related: ["cannes-lions-grand-prix-winners", "super-bowl-commercials"],
    filter: { tags: ["emotional", "heartwarming", "touching", "moving", "tear", "powerful"] },
  },
  {
    slug: "award-winning-campaigns",
    section: "best-of",
    title: "Award-Winning Ad Campaigns",
    headline: "Award-Winning Campaigns",
    seoTitle: "Award-Winning Ad Campaigns — The Creatives Room",
    seoDescription: "Grand Prix, Gold Lions, D&AD Black Pencils — the campaigns that swept the award shows and redefined what advertising can do.",
    intro: "Cannes Lions Grand Prix. D&AD Black Pencils. Clio Awards. One Show Gold. The major advertising award shows exist to surface the work that pushes the craft forward — campaigns where the thinking is rigorous, the execution is considered, and the result is something the industry hasn't quite seen before. This collection brings together the most decorated work from across the archive: the campaigns that judges couldn't ignore.",
    closing: "Award-winning work divides opinion among creatives — some see it as the highest standard, others as a game divorced from real-world effectiveness. The truth is somewhere in between. At their best, award shows reward genuine craft and genuine ideas. At their worst, they reward ideas built to win awards. This collection leans toward the former: work that won because it was great, not work that was engineered to look great to a jury.",
    related: ["cannes-lions-grand-prix-winners", "female-led-campaigns"],
    filter: { tags: ["cannes lions", "d&ad", "clio", "award winning", "grand prix", "gold lion", "pencil"] },
  },
  {
    slug: "nike-best-ads",
    section: "best-of",
    title: "Nike's Greatest Ads",
    headline: "Nike",
    seoTitle: "Nike's Best Ads & Campaigns — The Creatives Room",
    seoDescription: "Just Do It. Nike's most iconic ads, from Bo Knows to Write the Future — the campaigns that made sport feel like art.",
    intro: "No brand has a stronger creative legacy in advertising than Nike. Since the launch of 'Just Do It' in 1988, Nike has treated every campaign as an opportunity to say something meaningful about sport, competition, and what it means to push yourself. Working primarily with Wieden+Kennedy, the brand produced some of the most celebrated films, print ads, and campaigns in advertising history — work that didn't sell shoes so much as it sold a way of seeing the world.",
    closing: "Nike's archive is essential study for any creative. Not because you should make Nike-style ads, but because the brand demonstrates what happens when a client and agency trust each other completely over decades. The work gets braver, more specific, and more culturally embedded with every year. That kind of creative ambition is rare — and worth understanding.",
    related: ["wieden-and-kennedy-best-work", "award-winning-campaigns"],
    filter: { brand: "Nike" },
  },
  {
    slug: "wieden-and-kennedy-best-work",
    section: "agencies",
    title: "Wieden+Kennedy — Best Work",
    headline: "Wieden+Kennedy",
    seoTitle: "Wieden+Kennedy Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The agency behind Nike, Old Spice, and Honda. W+K's most celebrated campaigns, curated from the archive.",
    intro: "Founded in Portland in 1982 by Dan Wieden and David Kennedy, Wieden+Kennedy built its reputation on one of the great client relationships in advertising history: Nike. But the agency's creative legacy extends far beyond a single brand. Old Spice's 'The Man Your Man Could Smell Like', Honda's 'Cog', Chrysler's 'Born of Fire' — W+K has a habit of producing work that feels genuinely surprising, regardless of the brief or the budget.",
    closing: "What makes W+K's body of work distinctive isn't a house style — it's a culture. The agency has always hired people who think like writers and directors, not just advertising creatives. The result is work that draws from film, literature, and music in ways that most agencies don't. If you want to understand what it looks like when advertising aspires to be more than advertising, this is the archive to study.",
    related: ["nike-best-ads", "ogilvy-best-campaigns"],
    filter: { agency: "Wieden" },
  },
  {
    slug: "ogilvy-best-campaigns",
    section: "agencies",
    title: "Ogilvy — Best Campaigns",
    headline: "Ogilvy",
    seoTitle: "Ogilvy Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The house that David built. Ogilvy's most iconic campaigns from decades of defining what great advertising looks like.",
    intro: "David Ogilvy believed advertising should sell, and sell it did. But the agency he founded in 1948 also understood that the most effective advertising is the most human advertising — work that respects the intelligence of its audience and earns their attention rather than demanding it. From the Hathaway Man to Dove's Real Beauty, Ogilvy has produced campaigns that are as strategically rigorous as they are creatively ambitious.",
    closing: "Ogilvy's archive spans eight decades and every medium imaginable, which makes it one of the most useful bodies of work for studying how great creative thinking adapts across eras and channels. The brief changes, the media changes, the culture changes — but the underlying discipline of finding a truth and expressing it clearly remains constant. That's the Ogilvy lesson, and it hasn't aged.",
    related: ["bbdo-best-work", "award-winning-campaigns"],
    filter: { agency: "Ogilvy" },
  },
  {
    slug: "bbdo-best-work",
    section: "agencies",
    title: "BBDO — Best Work",
    headline: "BBDO",
    seoTitle: "BBDO Best Ads & Campaigns — The Creatives Room",
    seoDescription: "The work is everything. BBDO's most celebrated campaigns across decades of award-winning creativity.",
    intro: "BBDO's internal mantra — 'The Work. The Work. The Work.' — isn't a slogan; it's a philosophy. The New York-founded agency has spent over a century insisting that the quality of the creative product is the only thing that matters, and its output reflects that belief. From Pepsi and GE to FedEx and Guinness, BBDO has consistently produced campaigns that combine commercial effectiveness with genuine craft.",
    closing: "BBDO is one of the most awarded agencies in Cannes Lions history, and its work is worth studying not just for the executions but for the strategic thinking underneath them. The agency excels at finding the emotional truth inside a functional brief — turning a delivery company into a story about reliability, or a soft drink into a symbol of generational identity. That gap between the brief you receive and the campaign you make is where BBDO has always lived.",
    related: ["ogilvy-best-campaigns", "wieden-and-kennedy-best-work"],
    filter: { agency: "BBDO" },
  },
];

export function findCollection(section: string, slug: string): Collection | undefined {
  return collections.find((c) => c.section === section && c.slug === slug);
}
