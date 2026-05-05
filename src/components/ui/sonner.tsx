import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      offset="50vh"
      mobileOffset="50vh"
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast pointer-events-auto !w-[min(92vw,420px)] !p-5 !rounded-none border hairline bg-background/95 text-foreground backdrop-blur-xl shadow-[0_30px_80px_-20px_hsl(var(--foreground)/0.35)] animate-scale-in",
          title: "font-mono text-[11px] uppercase tracking-[0.25em]",
          description: "text-sm text-muted-foreground mt-1.5 font-light leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-mono group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-widest",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:font-mono group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-widest",
          success: "!border-l-2 !border-l-primary",
          error: "!border-l-2 !border-l-destructive",
          info: "!border-l-2 !border-l-foreground",
          warning: "!border-l-2 !border-l-foreground",
          icon: "!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
