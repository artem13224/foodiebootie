'use client'

import { useEffect, useRef, useState } from 'react'

interface BarcodeScannerProps {
  onDetect: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const detectedRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zxingRef = useRef<any>(null)

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setStatus('scanning')

        // ── BarcodeDetector (Chrome / Android / iOS 17+) ─────────────────────
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          })
          const scan = async () => {
            if (cancelled || detectedRef.current || !videoRef.current) return
            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0 && !detectedRef.current) {
                detectedRef.current = true
                onDetect(barcodes[0].rawValue)
                return
              }
            } catch { /* no barcode in frame — continue */ }
            rafRef.current = requestAnimationFrame(scan)
          }
          rafRef.current = requestAnimationFrame(scan)
        } else {
          // ── @zxing/library fallback (Firefox / older iOS) ──────────────────
          const { BrowserMultiFormatReader } = await import('@zxing/library')
          if (cancelled) return
          const reader = new BrowserMultiFormatReader()
          zxingRef.current = reader
          if (videoRef.current) {
            reader.decodeFromStream(stream, videoRef.current, (result) => {
              if (result && !detectedRef.current && !cancelled) {
                detectedRef.current = true
                onDetect(result.getText())
              }
            })
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Camera permission denied. Allow camera access in your browser settings.'
              : 'Could not start camera.'
          )
        }
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      zxingRef.current?.reset()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onDetect])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: '#000',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: 'max(24px, env(safe-area-inset-top)) 20px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: '18px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: '#FFFFFF',
        }}>
          SCAN BARCODE
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFFFFF', padding: '8px' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {/* Camera preview */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        playsInline
        muted
        autoPlay
      />

      {/* Viewfinder */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {/* Dark surround */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            WebkitMaskImage: `radial-gradient(ellipse 280px 165px at 50% 50%, transparent 99%, black 100%)`,
            maskImage: `radial-gradient(ellipse 280px 165px at 50% 50%, transparent 99%, black 100%)`,
          }} />
          {/* Border box */}
          <div style={{ width: '280px', height: '165px', position: 'relative' }}>
            {/* Corners — four separate divs to avoid union-type inference issues */}
            {([
              { top: 0, left: 0, borderTop: '2px solid var(--color-accent)', borderLeft: '2px solid var(--color-accent)' },
              { top: 0, right: 0, borderTop: '2px solid var(--color-accent)', borderRight: '2px solid var(--color-accent)' },
              { bottom: 0, left: 0, borderBottom: '2px solid var(--color-accent)', borderLeft: '2px solid var(--color-accent)' },
              { bottom: 0, right: 0, borderBottom: '2px solid var(--color-accent)', borderRight: '2px solid var(--color-accent)' },
            ] as React.CSSProperties[]).map((style, i) => (
              <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...style }} />
            ))}
            {/* Scan line */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '50%',
              height: '1.5px',
              background: 'linear-gradient(to right, transparent, var(--color-accent), transparent)',
            }} />
          </div>
        </div>
      )}

      {/* Starting state */}
      {status === 'starting' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
          }}>
            STARTING CAMERA...
          </span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 40px',
          gap: '16px',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '14px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#FFFFFF',
            textAlign: 'center',
          }}>
            {errorMsg}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              backgroundColor: 'var(--color-accent)',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            CLOSE
          </button>
        </div>
      )}

      {/* Hint */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute',
          bottom: 'max(40px, env(safe-area-inset-bottom))',
          left: 0, right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
          }}>
            POINT AT BARCODE TO SCAN
          </span>
        </div>
      )}
    </div>
  )
}
