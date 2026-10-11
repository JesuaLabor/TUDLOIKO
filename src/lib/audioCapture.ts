// ─── Types ────────────────────────────────────────────────────────────────────
export interface AudioDevice {
  deviceId: string
  label: string
  isMonitor: boolean // true for PulseAudio/PipeWire monitor sources
}

export interface CaptureConfig {
  deviceId?: string
  chunkIntervalMs?: number   // timeslice for MediaRecorder buffer collection (default: 1000ms)
  silenceThreshold?: number  // 0–255 RMS amplitude below which counts as silence (default: 10)
  silenceDurationMs?: number // silence delay to trigger utterance end (default: 1500ms)
  maxUtteranceMs?: number    // force flush utterance after N ms (default: 8000ms)
  mode?: 'manual' | 'auto'   // 'manual' waits for Stop; 'auto' flushes on silence pauses
}

export type ChunkCallback = (blob: Blob, mimeType: string) => void
export type SilenceCallback = () => void
export type LevelCallback = (level: number) => void // 0–100 normalized amplitude
export type ErrorCallback = (err: Error) => void

// ─── AudioCaptureManager (Smart VAD Accumulation) ──────────────────────────────
export class AudioCaptureManager {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private vadTimer: ReturnType<typeof setInterval> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null

  private onChunkCb: ChunkCallback | null = null
  private onSilenceCb: SilenceCallback | null = null
  private onLevelCb: LevelCallback | null = null
  private onErrorCb: ErrorCallback | null = null

  private isSilent = true
  private isCapturing = false
  private captureMode: 'manual' | 'auto' = 'manual'

  // Smart VAD Utterance Buffer
  private chunksBuffer: Blob[] = []
  private hasSpokenInCurrentUtterance = false
  private currentMimeType = 'audio/webm'

  // ── Device enumeration ──────────────────────────────────────────────────────
  static async listDevices(): Promise<AudioDevice[]> {
    try {
      // Request a temporary stream so browsers populate device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach((t) => t.stop())
    } catch {
      // Ignore — labels might still be populated if permission was previously granted
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        // PulseAudio monitor sources typically contain "monitor" in the label
        isMonitor: d.label.toLowerCase().includes('monitor'),
      }))
  }

  // ── Start capture ───────────────────────────────────────────────────────────
  async start(config: CaptureConfig = {}): Promise<void> {
    if (this.isCapturing) return
    const {
      deviceId,
      silenceThreshold = 10,
      silenceDurationMs = 1500,
      maxUtteranceMs = 8000,
      mode = 'manual',
    } = config

    this.captureMode = mode
    this.chunksBuffer = []
    this.hasSpokenInCurrentUtterance = false
    this.isSilent = true

    try {
      // Get audio stream
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)

      // Set up Web Audio API for VAD
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      this.audioCtx = new AudioCtx()
      // iOS Safari starts AudioContext suspended — resume so the level meter / VAD works
      if (this.audioCtx.state === 'suspended') {
        try { await this.audioCtx.resume() } catch {}
      }
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 512
      source.connect(this.analyser)

      // Set up MediaRecorder — iOS Safari only supports MP4/AAC (no WebM/Ogg)
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ]
      const supported = typeof MediaRecorder.isTypeSupported === 'function'
        ? candidates.find((t) => MediaRecorder.isTypeSupported(t))
        : undefined
      this.currentMimeType = supported || ''

      this.initRecorder()
      this.isCapturing = true

      // ── VAD polling ──────────────────────────────────────────────────────────
      const dataArray = new Uint8Array(this.analyser.fftSize)
      this.vadTimer = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteTimeDomainData(dataArray)

        // RMS amplitude
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const val = dataArray[i] - 128
          sum += val * val
        }
        const rms = Math.sqrt(sum / dataArray.length)

        // Normalize 0–100 for UI visualizer
        const level = Math.min(100, Math.round((rms / 128) * 100 * 4))
        this.onLevelCb?.(level)

        // Voice Activity Detection logic
        if (rms >= silenceThreshold) {
          this.hasSpokenInCurrentUtterance = true
          this.isSilent = false
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
          }

          // In 'auto' mode only: cycle if single utterance exceeds max length
          if (this.captureMode === 'auto') {
            if (!this.maxTimer) {
              this.maxTimer = setTimeout(() => {
                this.cycleUtterance()
              }, maxUtteranceMs)
            }
          }
        } else {
          // Silence detected
          // In 'auto' mode only: automatically cycle utterance on pause
          if (this.captureMode === 'auto' && !this.isSilent && this.hasSpokenInCurrentUtterance) {
            this.isSilent = true
            this.silenceTimer = setTimeout(() => {
              this.cycleUtterance()
              this.onSilenceCb?.()
            }, silenceDurationMs)
          }
        }
      }, 80) // poll every 80ms (~12fps)
    } catch (err) {
      this.onErrorCb?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  // ── Helper: Initialize a clean MediaRecorder instance ──────────────────────
  private initRecorder(): void {
    if (!this.stream) return

    this.recorder = this.currentMimeType
      ? new MediaRecorder(this.stream, { mimeType: this.currentMimeType })
      : new MediaRecorder(this.stream)
    // Use the format the browser actually produces (e.g. audio/mp4 on iPhone)
    if (this.recorder.mimeType) this.currentMimeType = this.recorder.mimeType
    if (!this.currentMimeType) this.currentMimeType = 'audio/mp4'

    this.recorder.ondataavailable = (e) => {
      // NEVER drop chunks: the first chunk contains the essential EBML container header!
      if (e.data && e.data.size > 0) {
        this.chunksBuffer.push(e.data)
      }
    }

    this.recorder.onerror = (e) => {
      this.onErrorCb?.(new Error(`MediaRecorder error: ${e.type}`))
    }

    // Start without timeslice to record continuous, non-fragmented WebM
    this.recorder.start()
  }

  // ── Cycle utterance for Auto mode (ensures each question has its own EBML header) ─
  private async cycleUtterance(): Promise<void> {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
    if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null }
    if (!this.hasSpokenInCurrentUtterance || !this.recorder) return

    const recorder = this.recorder
    this.hasSpokenInCurrentUtterance = false
    this.isSilent = true

    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        try {
          recorder.stop()
        } catch {
          resolve()
        }
      })
      recorder.ondataavailable = null
      recorder.onstop = null
    }

    if (this.chunksBuffer.length > 0) {
      const combinedBlob = new Blob(this.chunksBuffer, { type: this.currentMimeType })
      this.chunksBuffer = []
      if (combinedBlob.size >= 800 && this.onChunkCb) {
        this.onChunkCb(combinedBlob, this.currentMimeType)
      }
    }

    // If still capturing in auto mode, start a fresh recorder for the next question
    if (this.isCapturing && this.captureMode === 'auto' && this.stream && this.stream.active) {
      this.initRecorder()
    }
  }

  // ── Stop capture ────────────────────────────────────────────────────────────
  async stop(flush: boolean = true): Promise<void> {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null }
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
    if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null }

    const recorder = this.recorder
    this.recorder = null
    this.isCapturing = false

    // Properly await recorder's onstop event to ensure the complete WebM file is flushed
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        try {
          recorder.stop()
        } catch {
          resolve()
        }
      })
      recorder.ondataavailable = null
      recorder.onstop = null
    }

    if (this.audioCtx) {
      try { await this.audioCtx.close() } catch {}
      this.audioCtx = null
    }
    this.analyser = null

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }

    if (flush && this.chunksBuffer.length > 0) {
      const combinedBlob = new Blob(this.chunksBuffer, { type: this.currentMimeType })
      this.chunksBuffer = []
      this.hasSpokenInCurrentUtterance = false
      this.isSilent = true

      // Only dispatch if recorded audio has valid content
      if (combinedBlob.size >= 800 && this.onChunkCb) {
        this.onChunkCb(combinedBlob, this.currentMimeType)
      }
    } else {
      this.chunksBuffer = []
      this.hasSpokenInCurrentUtterance = false
      this.isSilent = true
    }
  }

  // ── Event registration ──────────────────────────────────────────────────────
  onChunk(cb: ChunkCallback)   { this.onChunkCb = cb; return this }
  onSilence(cb: SilenceCallback) { this.onSilenceCb = cb; return this }
  onLevel(cb: LevelCallback)   { this.onLevelCb = cb; return this }
  onError(cb: ErrorCallback)   { this.onErrorCb = cb; return this }

  get capturing() { return this.isCapturing }
}

// ─── Blob → base64 helper ─────────────────────────────────────────────────────
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!blob || blob.size === 0) {
      resolve('')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      if (!result || !result.includes(',')) {
        resolve('')
        return
      }
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
