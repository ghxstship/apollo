"use client";

import React from "react";
import { Button } from "@/components/ds";
import "./camera-scanner.css";

/* Camera QR scanning for the gangway — native BarcodeDetector where the
   platform has it (Chrome/Android, the likely dock device), jsQR frame
   decoding everywhere else (iOS Safari). Decoded codes feed the exact same
   check-in path as the input field, offline queue included. */

type DetectorLike = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => DetectorLike;
  }
}

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const lastRef = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let jsqr: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    const emit = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      // The camera sees the same code dozens of times a second — fire once,
      // then hold fire on that code for a few beats.
      if (lastRef.current.code === code && now - lastRef.current.at < 3500) return;
      lastRef.current = { code, at: now };
      onScanRef.current(code);
    };

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setError("The camera declined. Check permissions, or type the code.");
        return;
      }
      if (stopped || !videoRef.current) return;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;
      if (!detector) {
        const mod = await import("jsqr");
        jsqr = (data, w, h) => mod.default(data, w, h, { inversionAttempts: "dontInvert" });
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            if (detector) {
              const found = await detector.detect(video);
              for (const b of found) emit(b.rawValue);
            } else if (jsqr && ctx) {
              const w = 480;
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const hit = jsqr(img.data, w, h);
              if (hit?.data) emit(hit.data);
            }
          } catch {
            /* a bad frame is just a bad frame — the next one is coming */
          }
        }
        raf = requestAnimationFrame(() => void tick());
      };
      raf = requestAnimationFrame(() => void tick());
    };

    void run();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <div className="cam-scan">
      <Button
        variant={open ? "ghost" : "outline"}
        size="sm"
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
      >
        {open ? "Stop the camera" : "Scan with camera"}
      </Button>
      {open ? (
        <div className="cam-scan__frame">
          {/* Mirrorless: the dock crew points the back camera at the member card. */}
          <video ref={videoRef} muted playsInline className="cam-scan__video" />
          <div className="cam-scan__reticle" aria-hidden="true"></div>
          <span className="cam-scan__hint">Hold the code steady in the frame</span>
        </div>
      ) : null}
      {error ? (
        <span className="cam-scan__err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
