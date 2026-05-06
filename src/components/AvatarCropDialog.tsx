import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Props {
  src: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (blob: Blob) => void | Promise<void>;
}

async function getCroppedBlob(src: string, area: Area, rotation: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = img.width * cos + img.height * sin;
  const bBoxH = img.width * sin + img.height * cos;

  // Draw rotated full image to a working canvas
  const work = document.createElement("canvas");
  work.width = bBoxW;
  work.height = bBoxH;
  const wctx = work.getContext("2d")!;
  wctx.translate(bBoxW / 2, bBoxH / 2);
  wctx.rotate(rad);
  wctx.drawImage(img, -img.width / 2, -img.height / 2);

  // Crop the area
  const out = document.createElement("canvas");
  const size = Math.min(area.width, area.height, 512);
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d")!;
  octx.drawImage(work, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((res) => out.toBlob((b) => res(b!), "image/jpeg", 0.92));
}

export function AvatarCropDialog({ src, open, onOpenChange, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_: Area, px: Area) => setAreaPx(px), []);

  async function handleSave() {
    if (!src || !areaPx) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, areaPx);
      await onCropped(blob);
      onOpenChange(false);
      setZoom(1);
      setRotation(0);
      setCrop({ x: 0, y: 0 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Adjust photo</DialogTitle>
        </DialogHeader>
        <div className="relative h-[300px] bg-muted">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onComplete}
            />
          )}
        </div>
        <div className="space-y-3 pt-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Zoom</p>
            <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Rotation</p>
            <Slider min={0} max={360} step={1} value={[rotation]} onValueChange={(v) => setRotation(v[0])} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-mono text-xs uppercase tracking-widest">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !areaPx} className="font-mono text-xs uppercase tracking-widest">
            {busy ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
