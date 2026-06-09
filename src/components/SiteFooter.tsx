import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="border-t hairline mt-20 bg-background/80 backdrop-blur-sm">
      <div className="container py-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            ⏵ Disclaimer
          </p>
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            The Creatives Room is a curated reference archive for educational
            and inspirational purposes. All featured work, trademarks, brand
            names and visuals are the property of their respective owners. We
            do not claim ownership of, or any rights to, the projects shown
            here. If you are a rights holder and would like a piece removed or
            credited differently, please get in touch.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <Link
            to="/contact"
            className="font-mono text-[11px] uppercase tracking-widest hover:text-primary transition-colors"
          >
            Contact
          </Link>
          <Link
            to="/pricing"
            className="font-mono text-[11px] uppercase tracking-widest hover:text-primary transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/privacy"
            className="font-mono text-[11px] uppercase tracking-widest hover:text-primary transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="font-mono text-[11px] uppercase tracking-widest hover:text-primary transition-colors"
          >
            Terms of Service
          </Link>
          <span className="font-mono uppercase tracking-widest text-muted-foreground text-xs text-right whitespace-pre-line">
            © {new Date().getFullYear()} THE CREATIVES ROOM{"\n"}L&L♥
          </span>
        </div>
      </div>
    </footer>
  );
}
